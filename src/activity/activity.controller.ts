import { Controller, Get, Query } from '@nestjs/common';
import { ACTIVITY_EVENTS, PAGINATION } from 'src/consts';
import { Activity } from 'src/database/entities/Activity';
import { Nft } from 'src/database/entities/Nft';
import { User } from 'src/database/entities/User';

@Controller('activities')
export class ActivityController {
  @Get()
  async filterActivities(@Query() query: any) {
    const { offset, address, categories, collectionId } = query;

    let qb = Activity.createQueryBuilder('a')
      .leftJoinAndMapOne(
        'a.user',
        User,
        'Users1',
        'Users1.pubKey ILIKE a.userAddress',
      )
      .leftJoinAndMapOne(
        'a.receiver',
        User,
        'Users2',
        'Users2.pubKey ILIKE a.receiver',
      )
      .leftJoinAndMapOne('a.nft', Nft, 'Nfts', 'Nfts.id = a.nft')
      .orderBy('a.createdAt', 'DESC')
      .offset(+offset || 0)
      .take(PAGINATION);

    if (address) {
      qb = qb.where(
        '(a.userAddress ILIKE :address OR a.receiver ILIKE :address)',
        { address },
      );
    }

    if (collectionId) {
      qb = qb.andWhere('a.collectionId = :collectionId', { collectionId });
    }

    if (categories?.length) {
      const events = [];

      for (const c of categories) {
        if (typeof ACTIVITY_EVENTS[c] === 'string') {
          events.push(ACTIVITY_EVENTS[c]);
        } else {
          events.push(...Object.values(ACTIVITY_EVENTS[c]));
        }
      }

      qb = qb.andWhere('a.event IN (:...events)', { events });
    }

    const activities = await qb.getMany();

    return activities;
  }
}
