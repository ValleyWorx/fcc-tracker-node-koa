'use strict';
const User = require('./user.js');

class LocationHandlers {

  static async addLocation(ctx) {
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    const name = ctx.request.body.name;

    try {
      let code = randomstring.generate(6);
      let sqla = 'select * from team where code = ?';
      while (![await global.db.query(sqla, code)].length) {
        code = randomstring.generate(6);
      }

      const dateObj = new Date();
      let billingDay = dateObj.getUTCDate();
      if (billingDay > 28) billingDay = 28;

      sqla = 'insert into team (name, code, status, billingDay) values (?, ?, 1, ?)';
      const [res] = await global.db.query(sqla, [ name, code, billingDay ]);
      const teamID = res.insertId;

      if (teamID) {
        sqla = 'update user set teamID = :teamID where id = :userID';
        await global.db.query(sqla, { userID: user.id, teamID: teamID });

        sqla = 'insert into teamManager (teamID, userID) values (:teamID, :userID)';
        await global.db.query(sqla, { userID: user.id, teamID: teamID });

                // await calcTeamMonth(teamID);
        ctx.body = { teamID: teamID };
      } else {
        ctx.status = 500;
      }
    } catch (e) {
      switch (e.code) {
        case 'ER_BAD_FIELD_ERROR':
          ctx.throw(403, 'Unrecognised Member field');
          break;
        default:
          throw e;
      }
    }
  }

  static async addUserToLocation(ctx) {
    try {
      const locationID = ctx.params.locationID;
      const userID = ctx.params.userID;
      const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

      const sqla = 'update user set locationID = ? where id = ?';
      const res = await global.db.query(sqla, [ locationID, user.id ]);

    } catch (e) {
      switch (e.code) {
        case 'ER_BAD_FIELD_ERROR':
          ctx.throw(403, 'Unrecognised Member field');
          break;
        default:
          throw e;
      }
    }
  }

  static async getLocationInfo(ctx, locationID = 0) {

    console.log('Getting Location Info');

    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

        // use same ternary operator as above on locationID and user.locationID
    const loc = ctx.state.user ? await User.get(ctx.state.user.locationID) : null;

        // Use sql to find a list of all users in your same location.
    const [[localUsers]] = await global.db.query(
            `SELECT *
             FROM user
             WHERE locationID = :locationID`,
          { locationID: 1 }
      );
    console.log(localUsers);
        // Loop through them and...
        //   User.scrapeUser(ctx, userID)
        //   Create an array of userIDs  use push to an array defined above

        // Use array.join to make a comma separated list of userIDs

        // Find the count(*) of the userChallenge where cDate > (user moment to calculate a month ago) and userID in ([comma separated list of userIDs])
        // Find the count(*) of the userChallenge where cDate > (user moment to calculate a week ago) and userID in ([comma separated list of userIDs])

  }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = TeamHandlers;
