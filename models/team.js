/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  API handlers - Team
router.get(   '/admin/teams',   team.adminGetTeams);
router.put(   '/admin/team/:teamID/price',   team.adminSetTeamPrice);
router.delete(   '/admin/team/:teamID/price',   team.adminRemoveTeamPrice);

router.get(   '/team',   team.getTeam);
router.post(   '/team',   team.addTeam);
router.put(   '/team/:teamID',   team.updateTeam);
router.delete(   '/team/:teamID',   team.removeTeam);

router.post(   '/team/:teamID/county/:countyID',   team.addTeamCounty);
router.delete(   '/team/:teamID/county/:countyID',   team.removeTeamCounty);

router.post(   '/team/:teamID/member',   team.addTeamMember);
router.put(   '/team/:teamID/member/:memberID',   team.updateTeamMember);
router.delete(   '/team/:teamID/member/:memberID',   team.removeTeamMember);


        const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';
const randomstring = require('randomstring');
const User = require('./user.js');

class TeamHandlers {

  static async inviteToTeam(ctx) {
    try {
      const email = ctx.request.body.email.trim();
      const teamID = ctx.params.teamID;
      const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      const sqlFind = `select id, teamID from user where email = ?`;
      const [[userRes]] = await global.db.query(sqlFind, [email]);

      if (userRes) {
        if (userRes.teamID == 0) {
          const sqlUpdate = `update user set teamID = ? where id = ?`;
          const [res] = await global.db.query(sqlUpdate, [teamID, userRes.id]);
          // await calcTeamMonth(teamID);
          ctx.body = { message: 'Existing unattached user added to team.' };
        } else if (userRes.teamID == teamID) {
          ctx.body = { message: 'User is already on this team.' };
        } else {
          ctx.body = {
            processError: 1,
            message: 'User is already on another team, can not add.'
          };
        }
      } else {
        const sqlInsert = `insert into teamInvite (teamID, email) values (?,?)`;
        const [res] = await global.db.query(sqlInsert, [teamID, email]);
        ctx.body = { message: 'User is invited to this team.' };
      }
    } catch (e) {
      console.log('Error caught in inviteToTeam: ' + e);
      if (e.message.substring(0, 10) == 'Duplicate '){
        ctx.body = {processError: 1, message: 'That person has already been invited to this team.'};
      }else {
        throw(e);
      }
    }
  }

  static async adminGetTeams(ctx) {

    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    if (user.role < 3) {
      ctx.status = 404;
      ctx.body = 'forbidden';
      return;
    }

    try {
      let sqla = `select * from team`;
      const [teams] = await global.db.query(sqla);
      ctx.body = teams;
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

  static async getTeam(ctx) {
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    let teamID = ctx.params.teamID;
    let manager = false;
    let team = [];

    try {
      if (teamID) {
        if (!await teamSecurity(user, teamID)) {
          ctx.status = 403;
          ctx.body = { message: 'forbidden' };
          return;
        } else {
          manager = true;
        }
      } else {
        let sqla = `select teamID from user where id = ?`;
        let [[res]] = await global.db.query(sqla, [user.id]);

        if (res) {
          teamID = res.teamID;
          let sqla = `select teamID from teamManager where userID = ? and teamID = ?`;
          let [[res2]] = await global.db.query(sqla, [user.id, teamID]);

          if (res2) {
            manager = true;
          }
        }
      }
      if (teamID) {
        team = await TeamHandlers.getTeamInfo(teamID);
      }

      ctx.body = team;

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

  static async getTeamInfo(teamID) {

    let sqla = `select * from team where id = ?`;

    let [[team]] = await global.db.query(sqla, [teamID]);
    team.memberIDs = [];
    sqla = `select u.id, u.email, u.fname, u.lname, u.status, u.holding, IF(m.userID, 1, 0) isAdmin
              from user u
                   left outer join teamManager m on m.userID = u.id and m.teamID = :teamID 
             where u.teamID = :teamID2`;
    [team.members] = await global.db.query(sqla, {teamID:teamID, teamID2:teamID});
    team.clientCount = 0;
    team.rollupClientCount = 0;

    const teamMemberIDList = team.members.reduce((last, cur) => last + ',' + cur.id, '0');

    sqla = `select GROUP_CONCAT(a.countyID) as countyList from (select distinct countyID from geo where ownerListID in (select ownerListID from userClient where userID in (${teamMemberIDList}))) a`;

    const [[countyInfo]] = await global.db.query(sqla);
    const countyList = countyInfo.countyList;

    console.log('counties', countyList);

    sqla = `select c.id as countyID, c.name, p.id as cropID, p.name, sum(g.acres)
                  from geo g,
                       county c,
                       crop p
                 where g.countyID = c.id
                   and g.cropID = p.id
                   and countyID in (${countyList})
                 group by g.countyID, g.cropID`;

    const [countyCrops] = await global.db.query(sqla);




    for (let i in team.members) {
      //Get total acres of this users customers
      const detailSQL = `select c.name, p.name as crop, round(sum(g.acres)) as sumAcres
                         from geo g, county c, crop p
                        where g.countyID = c.id
                          and g.cropID = p.id
                          and g.ownerListID in (select ownerListID from userClient where userID = ?)
                          and g.cropID != 8 /* remove unclutivated */
                        group by c.name, p.name`;
      const [detailAcres] = await global.db.query(detailSQL, [team.members[i].id]);

      const countSQL = `select count(*) as clientCount
                         from userClient
                        where userID = :userID`;
      const [[countRes]] = await global.db.query(countSQL, {userID:  team.members[i].id});
      team.members[i].clientCount = countRes.clientCount;
      team.clientCount += countRes.clientCount;
      team.rollupClientCount += countRes.clientCount;
      const acresSQL = `select c.name, round(sum(g.acres)) as sumAcres
                         from geo g, county c
                        where g.countyID = c.id
                          and g.ownerListID in (select ownerListID from userClient where userID = ?)
                          and g.cropID != 8 /* remove unclutivated */
                        group by c.name`;
      [team.members[i].acres] = await global.db.query(acresSQL, [
        team.members[i].id
      ]);
      const parsedAcres = await TeamHandlers.parseAcres(detailAcres);
      for (let x in team.members[i].acres) {
        team.members[i].acres[x].crop = [];
        for (let p of parsedAcres[team.members[i].acres[x].name]){
          team.members[i].acres[x].crop.push(p);
        }
      }

      //Creat an array of this team's memeber IDs to get rollup info
      team.memberIDs.push(team.members[i].id);
    }

    const memberIDList = team.memberIDs.join(',');


    const custSQL = `select c.name, round(sum(g.acres)) sumAcres
                         from geo g, county c
                        where g.countyID = c.id
                          and g.ownerListID in (select ownerListID from userClient where userID in (${memberIDList}))
                          and g.cropID != 8 /* remove unclutivated */
                        group by c.name`;
    [team.acres] = await global.db.query(custSQL);

    const custPSQL = `select c.name, p.name as crop, round(sum(g.acres)) sumAcres
                         from geo g, county c, crop p
                        where g.countyID = c.id
                          and g.cropID = p.id
                          and g.cropID != 8 /* remove unclutivated */
                          and g.ownerListID in (select ownerListID from userClient where userID in (${memberIDList}))
                        group by c.name, p.name`;
    const [teamAcres] = await global.db.query(custPSQL);
    const parsedTeamAcres = await TeamHandlers.parseAcres(teamAcres);

    for (let x in team.acres) {
      team.acres[x].crop = [];
      team.acres[x].crop.push(parsedTeamAcres[team.acres[x].name]);
    }

    const sqlSubTeams = `select * from team where upline = ?`;
    const [subTeams] = await global.db.query(sqlSubTeams, [teamID]);
    team.subTeams = [];
    for (let s of subTeams) {
      const subT = await TeamHandlers.getTeamInfo(s.id);
      team.subTeams.push(subT);
      team.memberIDs = team.memberIDs.concat(subT.memberIDs);
      team.rollupClientCount += subT.rollupClientCount;
    }

    const rMemberIDList = team.memberIDs.join(',');

    const rcustSQL = `select c.name, round(sum(g.acres)) sumAcres
                         from geo g, county c
                        where g.countyID = c.id
                          and g.ownerListID in (select ownerListID from userClient where userID in (${rMemberIDList}))
                          and g.cropID != 8 /* remove unclutivated */
                        group by c.name`;
    [team.rollupAcres] = await global.db.query(rcustSQL);



    const rcustPSQL = `select c.name, p.name as crop, round(sum(g.acres)) sumAcres
                         from geo g, county c, crop p
                        where g.countyID = c.id
                          and g.cropID = p.id
                          and g.cropID != 8 /* remove unclutivated */
                          and g.ownerListID in (select ownerListID from userClient where userID in (${rMemberIDList}))
                        group by c.name, p.name`;
    const [rollupAcres] = await global.db.query(rcustPSQL);
    const parsedRollupAcres = await TeamHandlers.parseAcres(rollupAcres);

    for (let x in team.rollupAcres) {
      team.rollupAcres[x].crop = [];
      team.rollupAcres[x].crop.push(parsedRollupAcres[team.rollupAcres[x].name]);
    }


    const inviteSQL = `select * from teamInvite where teamID = ?`;
    [team.invites] = await global.db.query(inviteSQL, [teamID]);

    if (!team) team = [];

    return team;
  }

  static async parseAcres(acreList){
    const outAcres = {};
    let curCounty = '';
    for (let a of acreList){
      if (a.name !== curCounty){
        curCounty = a.name;
        outAcres[curCounty] = [];
      }
      delete a.name;
      a.acres = Math.round(a.acres);
      outAcres[curCounty].push(a);
    }

    return outAcres;

  }

  static async addTeam(ctx) {
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    const name = ctx.request.body.name;

    try {
      let code = randomstring.generate(6);
      let sqla = `select * from team where code = ?`;
      while (![await global.db.query(sqla, code)].length) {
        code = randomstring.generate(6);
      }

      let dateObj = new Date();
      let billingDay = dateObj.getUTCDate();
      if (billingDay > 28) billingDay = 28;

      sqla = `insert into team (name, code, status, billingDay) values (?, ?, 1, ?)`;
      const [res] = await global.db.query(sqla, [name, code, billingDay]);
      const teamID = res.insertId;

      if (teamID) {
        sqla = `update user set teamID = :teamID where id = :userID`;
        await global.db.query(sqla, {userID: user.id, teamID: teamID});

        sqla = `insert into teamManager (teamID, userID) values (:teamID, :userID)`;
        await global.db.query(sqla, {userID: user.id, teamID: teamID});

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

  static async updateTeam(ctx) {
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    const teamID = ctx.params.teamID;
    const name = ctx.request.body.name;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      let sqla = `update team set name = ? where id = ?`;
      const res = await global.db.query(sqla, [name, teamID]);
      ctx.body = { message: 'updated team' };
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

  static async removeTeam(ctx) {
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    const teamID = ctx.params.teamID;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      let sqla = `update user set teamID = NULL where id = ?`;
      await global.db.query(sqla, [user.id]);

      sqla = `delete from team where id = ?`;
      const res = await global.db.query(sqla, [teamID, user.id]);

      sqla = `delete from teamManager where teamID = ?`;
      await global.db.query(sqla, [teamID]);

      ctx.body = res;
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

  static async addTeamMember(ctx) {
    const teamID = ctx.params.teamID;
    const userID = ctx.params.userID;
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      let sqla = `update user set teamID = ?, status = 1 where id = ? and !teamID`;
      const res = await global.db.query(sqla, [teamID, user.id]);


      // await calcTeamMonth(teamID);

      ctx.body = { message: 'Added User' };
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

  static async updateTeamMember(ctx) {
    const fname = ctx.request.body.fname;
    const lname = ctx.request.body.lname;
    const email = ctx.request.body.email;
    const id = ctx.request.body.id;
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

    try {
      let sqla = `update user set fname = ?, lname = ?, email = ? where id = ?`;
      const res = await global.db.query(sqla, [fname, lname, email, id]);

      ctx.body = { message: 'Updated User' };
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

  static async disableTeamMember(ctx) {
    const teamID = ctx.params.teamID;
    const memberID = ctx.params.memberID;
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      let sqla = `update user set status = 0 where teamID = ? and id = ?`;
      const res = await global.db.query(sqla, [teamID, memberID]);

      ctx.body = { message: 'User Removed' };
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

  static async removeTeamMember(ctx) {
    const teamID = ctx.params.teamID;
    const memberID = ctx.params.memberID;
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      let sqla = `update user set email = '', password = '', fname = CONCAT('Data From ', fname), token = '', customerID = '', billingDay = 0, billingRate = 0, holding = 1 where teamID = ? and id = ?`;
      console.log('values', teamID, memberID);
      await global.db.query(sqla, [teamID, memberID]);

      sqla = `delete from userToken where userID = :userID`;
      await global.db.query(sqla, {userID: memberID});

      ctx.body = { message: 'Member Removed' };
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

  static async enableTeamMember(ctx) {
    const teamID = ctx.params.teamID;
    const memberID = ctx.params.memberID;
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      let sqla = `update user set status = 1 where teamID = ? and id = ?`;
      const res = await global.db.query(sqla, [teamID, memberID]);

      console.log(res);
      ctx.body = {message: 'User Enabled'};
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

  static async removeInvite(ctx) {
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;
    const email = ctx.request.body.email;
    const teamID = ctx.request.body.teamID;
    let remove = false;

    if (user.email == email) {
      remove = true;
    } else {
      //Check manager of team
      if (teamSecurity(user, teamID)) {
        remove = true;
      }
    }

    if (remove) {
      let sqla = `delete from teamInvite where email=? and teamID = ?`;
      const [[manager]] = await global.db.query(sqla, [email, teamID]);
      ctx.body = { message: 'invite removed.' };
    } else {
      ctx.body = { message: 'invite not removed.  Insufficient security.' };
    }
  }

  static async toggleTeamAdmin(ctx){
    const teamID = ctx.params.teamID;
    const userID = ctx.params.userID;
    const isAdmin = Number(ctx.params.isAdmin);
    const user = ctx.state.user ? await User.get(ctx.state.user.id) : null;

    try {
      if (!await teamSecurity(user, teamID)) {
        ctx.status = 403;
        return;
      }

      if (isAdmin === 1) {
        let sqla = `insert into teamManager (teamID, userID) values (:teamID, :userID)`;
        await global.db.query(sqla, {teamID: teamID, userID: userID});
      }else{
        let sqla = `delete from teamManager where teamID = :teamID and userID = :userID`;
        await global.db.query(sqla, {teamID: teamID, userID: userID});
      }
    }catch(e){
      console.log(e);
      throw(e);
    }
    ctx.body = {message: "toggled admin for team"}
  }

}

async function calcTeamMonth(teamID) {
  try {
    let sqla = `select * from team where id = ? `;
    const teamInfo = await global.db.query(sqla, [teamID]);

    var dateObj = new Date();
    let thisDay = dateObj.getUTCDate();
    if (thisDay > 28) thisDay = 28;

    let thisMonth = dateObj.getUTCMonth() + 1;
    let thisYear = dateObj.getUTCFullYear();

    if (teamInfo.billingDay < thisDay) {
      if (thisMonth == 12) {
        thisMonth = 1;
        thisYear++;
      } else {
        thisMonth++;
      }
    }

    sqla = `select count(*) as count from user where teamID = ? and status = 1`;
    const [[members]] = await global.db.query(sqla, [teamID]);
    let userCount = members.count;

    sqla = `select count(*) as count from teamCounty where teamID = ?`;
    const [[county]] = await global.db.query(sqla, [teamID]);
    let countyCount = county.count > 2 ? county.count : 2;

    sqla = `select * from teamMonth where teamID = ? and year = ? and month = ?`;
    const [[curMonth]] = await global.db.query(sqla, [
      teamID,
      thisYear,
      thisMonth
    ]);
    if (curMonth) {
      //Record already exists
      countyCount =
        curMonth.maxCounties >= countyCount
          ? curMonth.maxCounties
          : countyCount;
      userCount =
        curMonth.maxUsers >= userCount ? curMonth.maxUsers : userCount;
      sqla = `update teamMonth set maxUsers = ?, maxCounties = ? where teamID = ? and year = ? and month = ?`;
      await global.db.query(sqla, [
        userCount,
        countyCount,
        teamID,
        thisYear,
        thisMonth
      ]);
    } else {
      //Create a new record for this month.
      sqla = `insert into teamMonth (maxUsers, maxCounties, teamID, year, month) values (?,?,?,?,?)`;
      await global.db.query(sqla, [
        userCount,
        countyCount,
        teamID,
        thisYear,
        thisMonth
      ]);
    }

    return true;
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

async function teamSecurity(user, teamID) {
  let sqla = `select * from teamManager where teamID = :teamID and userID = :userID`;
  const [[manager]] = await global.db.query(sqla, {teamID: teamID, userID: user.id});
  if (user.role < 4 && !manager){
    let done = false;
    sqla = `select id, upline from team where teamID = :teamID`;
    let curteam = await global.db.query(sqla, {teamID: teamID, userID: user.id})
    while (curteam.upline && !done){
      sqla = `select * from teamManager where teamID = :teamID and userID = :userID`;
      const [[manager]] = await global.db.query(sqla, {teamID: curteam.upline, userID: user.id});
      if (manager) done = true;
      sqla = `select id, upline from team where teamID = :teamID`;
      let curteam = await global.db.query(sqla, {teamID: curteam.upline, userID: user.id})
    }
    if (!done) return false;
  }

  return true;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = TeamHandlers;
