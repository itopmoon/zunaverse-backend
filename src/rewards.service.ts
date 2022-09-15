import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { Contract } from 'web3-eth-contract';
import Provider from '@truffle/hdwallet-provider';
import Web3 from 'web3';

import { Nft } from './database/entities/Nft';
import { User } from './database/entities/User';
import RewardsABI from './indexer/abis/Rewards.json';
import { Reward } from './database/entities/Reward';
import { Collection } from './database/entities/Collection';
import { RewardDetail } from './database/entities/RewardDetail';
import { Transaction } from './database/entities/Transaction';
import { Between } from 'typeorm';

@Injectable()
export class RewardsService {
  logger = new Logger(RewardsService.name);
  rewardsContract: Contract;
  controllerAddress: string;

  constructor() {
    this.initContract();
  }

  async initContract() {
    const provider = new Provider(
      process.env.REWARDS_PRIVATE_KEY,
      process.env.RPC_URL,
    );
    const web3 = new Web3(provider);
    this.rewardsContract = new web3.eth.Contract(
      RewardsABI as any,
      process.env.REWARDS_CONTRACT,
    );
    this.controllerAddress = (await web3.eth.getAccounts())[0];
  }

  @Cron('0 0 1 * *')
  async releaseStaticRewards() {
    this.logger.log('Static Rewards Release...');
    const collection = await Collection.findOne({
      where: { id: 1 },
      relations: ['owner'],
    });
    const zunaNFTs = await Nft.createQueryBuilder('Nfts')
      .where('Nfts.collectionId = 1')
      .andWhere('Nfts.rewardsMonths < 12')
      .leftJoinAndMapOne('Nfts.owner', User, 'Users', 'Users.id = Nfts.ownerId')
      .getMany();

    if (!zunaNFTs.length) {
      this.logger.log('Static Rewards Ended.');
      return;
    }

    const tierFilterFn = (tier: number) =>
      zunaNFTs
        .filter(
          (nft) =>
            nft.properties.some(
              (p) => p.name.toLowerCase() === 'tier' && +p.value === tier,
            ) && nft.owner.id !== collection.owner.id,
        )
        .map((nft) => nft.owner.pubKey.toLowerCase());

    const tier1Owners = tierFilterFn(1);
    const tier2Owners = tierFilterFn(2);
    const tier3Owners = tierFilterFn(3);
    const tier4Owners = tierFilterFn(4);
    const tier5Owners = tierFilterFn(5);
    const tier6Owners = tierFilterFn(6);

    const result = await this.rewardsContract.methods
      .releaseStaticRewards([
        tier1Owners,
        tier2Owners,
        tier3Owners,
        tier4Owners,
        tier5Owners,
        tier6Owners,
      ])
      .send({
        from: this.controllerAddress,
      });

    const reward = Reward.create({
      tier1Holders: tier1Owners,
      tier2Holders: tier2Owners,
      tier3Holders: tier3Owners,
      tier4Holders: tier4Owners,
      tier5Holders: tier5Owners,
      tier6Holders: tier6Owners,
      rewardType: 'static',
      txHash: result.transactionHash,
    });
    await reward.save();
    const rewardDetailsTobeCreated: RewardDetail[] = [];

    for (const nft of zunaNFTs) {
      if (nft.owner.id === collection.owner.id) {
        continue;
      }
      const property = nft.properties.find(
        (p) => p.name.toLowerCase() === 'tier',
      );
      if (!property) {
        this.logger.error('Tier property error:');
        console.log(nft);
        continue;
      }
      const rewardDetail = RewardDetail.create({
        nftId: nft.id,
        userPubKey: nft.owner.pubKey.toLowerCase(),
        rewardId: reward.id,
        rewardTier: +nft.properties.find((p) => p.name.toLowerCase() === 'tier')
          .value,
        rewardType: 'static',
        txHash: reward.txHash,
      });
      nft.rewardsMonths += 1;
      await nft.save();
      rewardDetailsTobeCreated.push(rewardDetail);
    }
    await RewardDetail.save(rewardDetailsTobeCreated);
    this.logger.log(`Successfully released static rewards: ${reward.id}`);
  }

  @Cron('0 0 * * MON')
  async releaseBuybackRewards() {
    this.logger.log('Buyback Rewards Release...');
    const collection = await Collection.findOne({
      where: { id: 1 },
      relations: ['owner'],
    });
    const zunaNFTs = await Nft.createQueryBuilder('Nfts')
      .where('Nfts.collectionId = 1')
      .leftJoinAndMapOne('Nfts.owner', User, 'Users', 'Users.id = Nfts.ownerId')
      .getMany();

    const tierFilterFn = (tier: number) =>
      zunaNFTs
        .filter(
          (nft) =>
            nft.properties.some(
              (p) => p.name.toLowerCase() === 'tier' && +p.value === tier,
            ) && nft.owner.id !== collection.owner.id,
        )
        .map((nft) => nft.owner.pubKey.toLowerCase());

    const tier1Owners = tierFilterFn(1);
    const tier2Owners = tierFilterFn(2);
    const tier3Owners = tierFilterFn(3);
    const tier4Owners = tierFilterFn(4);
    const tier5Owners = tierFilterFn(5);
    const tier6Owners = tierFilterFn(6);

    const lastReward = await Reward.createQueryBuilder('r')
      .where('r.rewardType = :rewardType', { rewardType: 'buyback' })
      .orderBy('r.createdAt', 'DESC')
      .getOne();

    const transactions = await Transaction.find({
      where: {
        createdAt: Between(
          new Date(lastReward ? lastReward.createdAt : '2022.09.01'),
          new Date(),
        ),
      },
    });

    if (!transactions.length) {
      this.logger.log('No transactions this week');
      return;
    }
    const zunaTransactions = transactions.filter(
      (t) =>
        t.currency.toLowerCase() === process.env.ZUNA_ADDRESS.toLowerCase(),
    );
    const wbnbTransactions = transactions.filter(
      (t) =>
        t.currency.toLowerCase() === process.env.WBNB_ADDRESS.toLowerCase(),
    );
    let zunaAmount: any =
      zunaTransactions.reduce((sum, t) => t.amount + sum, 0) / 40;
    let wbnbAmount: any =
      wbnbTransactions.reduce((sum, t) => t.amount + sum, 0) / 40;

    zunaAmount = Web3.utils.toWei(`${zunaAmount}`, 'gwei');
    wbnbAmount = Web3.utils.toWei(`${wbnbAmount}`);

    this.logger.log(`Transactions: ${transactions.length}`);
    this.logger.log(`Zuna: ${zunaAmount}`);
    this.logger.log(`WBNB: ${wbnbAmount}`);

    try {
      this.logger.log(
        await this.rewardsContract.methods
          .releaseBuybackRewards(
            [
              tier1Owners,
              tier2Owners,
              tier3Owners,
              tier4Owners,
              tier5Owners,
              tier6Owners,
            ],
            wbnbAmount,
            zunaAmount,
          )
          .estimateGas({
            from: this.controllerAddress,
          }),
      );
    } catch (err) {
      console.error(err);
    }

    try {
      const result = await this.rewardsContract.methods
        .releaseBuybackRewards(
          [
            tier1Owners,
            tier2Owners,
            tier3Owners,
            tier4Owners,
            tier5Owners,
            tier6Owners,
          ],
          wbnbAmount,
          zunaAmount,
        )
        .send({
          from: this.controllerAddress,
        });

      this.logger.log(`Reward Result:`);
      console.log(result);

      const reward = Reward.create({
        tier1Holders: tier1Owners,
        tier2Holders: tier2Owners,
        tier3Holders: tier3Owners,
        tier4Holders: tier4Owners,
        tier5Holders: tier5Owners,
        tier6Holders: tier6Owners,
        rewardType: 'buyback',
        txHash: result.transactionHash,
        transactionIds: transactions.map((t) => t.id),
        zunaAmount,
        wbnbAmount,
      });
      await reward.save();
      const rewardDetailsTobeCreated: RewardDetail[] = [];

      for (const nft of zunaNFTs) {
        if (nft.owner.id === collection.owner.id) {
          continue;
        }
        const property = nft.properties.find(
          (p) => p.name.toLowerCase() === 'tier',
        );
        if (!property) {
          Logger.error('Tier property error:');
          console.log(nft);
          continue;
        }
        const rewardDetail = RewardDetail.create({
          nftId: nft.id,
          userPubKey: nft.owner.pubKey.toLowerCase(),
          rewardId: reward.id,
          rewardTier: +nft.properties.find(
            (p) => p.name.toLowerCase() === 'tier',
          ).value,
          rewardType: 'buyback',
          txHash: reward.txHash,
        });
        rewardDetailsTobeCreated.push(rewardDetail);
      }
      await RewardDetail.save(rewardDetailsTobeCreated);
      this.logger.log(`Successfully released buyback rewards: ${reward.id}`);
    } catch (err) {
      console.error(err);
    }
  }
}