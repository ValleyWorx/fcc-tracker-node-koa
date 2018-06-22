/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model; users allowed to access the system                                                 */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Lib = require('../lib/lib.js');
const ModelError = require('./modelerror.js');
const scrypt = require('scrypt'); // scrypt library
const moment = require('moment');
const jwt = require('jsonwebtoken'); // JSON Web Token implementation
const randomstring = require('randomstring');

//const fetch = require('node-fetch');

class User {

  static async getAuth(ctx) {

    if (!ctx.request.body.refreshToken && !ctx.request.body.email) {
      ctx.request.body = JSON.parse(ctx.request.body);
    }


    let user = null;
    if (ctx.request.body.refreshToken) {
      [user] = await User.getByToken(ctx.request.body.refreshToken);
      if (!user) {
        [user] = await User.getBy(
          'refreshToken',
          ctx.request.body.refreshToken
        );
        if (!user) ctx.throw(401, 'Bad Token not found');
      }
    } else {
      [user] = await User.getBy('email', ctx.request.body.email);

      if (!user) ctx.throw(401, 'Username/password not found');

      try {
        const match = await scrypt.verifyKdf(
          Buffer.from(user.password, 'base64'),
          ctx.request.body.password
        );

        if (!match) ctx.throw(401, 'Username/password not found.');
      } catch (e) {
        // e.g. "data is not a valid scrypt-encrypted block"
        //ctx.throw(404, e.message);
        ctx.throw(401, 'Username/password not found!');
      }
    }

    try {

      if (!user.teamID) {

      }

      const payload = {
        id: user.id, // to get user details
        role: user.role, // make role available without db query
        teamID: user.teamID,
        teamName: user.teamName,
        sharedData: user.sharedData,
        locationID: user.locationID,
      };
      //console.log('env', process.env.TOKEN_TIME);
      const token = jwt.sign(payload, process.env.JWT_KEY, {
        expiresIn: process.env.TOKEN_TIME,
      });
      const refreshToken = randomstring.generate(50);
      const decoded = jwt.verify(token, process.env.JWT_KEY); // throws on invalid token
      const ret = User.addToken(user.id, refreshToken);

      ctx.body = {
        jwt: token,
        role: user.role,
        fname: user.fname,
        lname: user.lname,
        id: user.id,
        refreshToken: refreshToken,
        expires: decoded.exp,
      };
    } catch (e) {
      console.log(e);
      // e.g. "data is not a valid scrypt-encrypted block"
      ctx.throw(404, e.message);
      //ctx.throw(404, 'Username/password not found!');
    }
  }

  static async deactivate(ctx) {
    await global.db.query('update user set status = 0 where id = :id', {
      id: ctx.state.user.id,
    });
    ctx.body = {msg: 'updated'};
  }

  static async reactivate(ctx) {
    const now = moment();
    let billingDay = now.format('DD');
    if (billingDay > 28) billingDay = 28;
    await global.db.query(
      'update user set status = 1, billingDay = :billingDay where id = :id',
      {
        id: ctx.state.user.id,
        billingDay: billingDay,
      }
    );
    ctx.body = {msg: 'updated'};
  }

  static async acceptInvite(ctx) {
    const user = await User.get(ctx.state.user.id);

    [invite] = await global.db.query(
      'Select * From teamInvite Where email = :email and teamID = :teamID limit 1',
      {
        email: user.email,
        teamID: ctx.params.teamID,
      }
    );

    if (invite.length) {
      await global.db.query(
        'update user set team = :teamID where id = :userID',
        {
          userID: user.id,
          teamID: ctx.params.teamID,
        }
      );

      await global.db.query(
        'Delete From teamInvite Where email = :email and teamID = :teamID limit 1',
        {
          email: user.email,
          teamID: ctx.params.teamID,
        }
      );

      ctx.body = {message: 'user added to team.', teamID: teamID};
    } else {
      ctx.body = {message: 'user not added to team.', teamID: 0};
    }
  }

  static async info(ctx) {
    const user = await User.get(ctx.state.user.id);
    [user.billing] = await global.db.query(
      'Select * From userBilling Where userID = :id order by id desc limit 1',
      {id: user.id}
    );

    const now = moment();
    const thisDay = now.format('DD');
    let thisMonth = now.format('MM');
    let thisYear = now.format('YYYY');

    if (user.billingDay < thisDay) {
      thisMonth++; //next billing is next month
    }

    if (thisMonth > 12) {
      thisMonth = 1;
      thisYear++;
    }

    user.billingMonth = thisMonth;
    user.billingYear = thisYear;

    console.log(user);

    ctx.body = user;
  }

  /*static async processCategory(userID, fccCode) {

        if (r.name === 'tr') {
          let categoryID = 0;
          let tableName = 'challenge';
          let userTableName = 'userChallenge';
          let columnName = 'challengeID';
          const category = r.children[0].children[0].children[0].data;
          const completed = r.children[1].children[0].data.split('"')[1].split('T')[0];
          console.log(category, completed);

          if (r.children[2].children) {
            tableName = 'project';
            userTableName = 'userProject';
            columnName = 'projectID';
          }

                  //go into db and take c.id that = category
          const [categ] = await global.db.query(`SELECT id FROM ${tableName} WHERE name = :category`,
                      { category: category });

                  //  if categ is not found/has length insert
          if (categ.length) {
            categoryID = categ[0].id;
          } else {
            const [insCategory] = await global.db.query(`INSERT INTO ${tableName} (name) VALUES (:category)`,
                          { category: category });
            categoryID = insCategory.insertId;
          }

          global.db.query(
                      `INSERT INTO ${userTableName}(userID, ${columnName}, completed, updated)
                     VALUES (:userID, :categoryID, :completed, :updated)
                     ON DUPLICATE KEY UPDATE completed = :completed`,
                      { userID: userID, categoryID: categoryID, completed: completed });
        }
      }
    }
  }*/

  static async scrapeUser(ctx) {
    const userID = ctx.state.user.id;
    const [[user]] = await global.db.query(
      `SELECT * 
            FROM user 
            WHERE id = :id`,
      {id: userID}
    );

    const url = `https://www.freecodecamp.org/${user.fccCode}`;
    const page = await global.browser.newPage();
    await page.goto(url);
    console.log('Page Reached...');
    await page.waitForSelector('#fcc > div > div.app-content.app-centered > div > div:nth-child(1) > div.row > div > table > tbody');

    const out = [];

    console.log('Scraping Challenges...');
    for (let i = 1; ; i++) {
      out[i - 1] = {};

      out[i - 1] = await page.evaluate((i) => {
        try {
          const ret = {};
          ret.challenge = document.querySelector(`#fcc > div > div.app-content.app-centered > div > div:nth-child(1) > div.row > div > table > tbody > tr:nth-child(${i}) > td:nth-child(1) > a`).textContent;
          ret.completed = document.querySelector(`#fcc > div > div.app-content.app-centered > div > div:nth-child(1) > div.row > div > table > tbody > tr:nth-child(${i}) > td.text-center > time`).textContent;
          return ret;
        } catch (e) {
          return false;
        }
      }, i);

      if (!out[i - 1].challenge) {
        break;
      }
    }

    for (const c of out) {

      // Figure out which challenge this is by matching on name in challenge table
      const challengeID = await global.db.query(
        `SELECT id
             FROM challenge
             WHERE name = :challengeName`,
        {challengeName: c.challenge}
      );

      const cDate = moment(c.completed);

      // Add this to the userChallenge table
      console.log(`INSERT INTO userChallenge (userID, challengeID, completed)
      VALUES (${userID}, ${challengeID}, '${completed}')
      ON DUPLICATE KEY UPDATE completed = '${completed}'`);
      await global.db.query(
        `INSERT INTO userChallenge (userID, challengeID, completed)
           VALUES (:userID, :challengeID, :completed)
           ON DUPLICATE KEY UPDATE completed = :completed`,
        { userID: userID, challengeID: challengeID, completed: cDate.format('YYYY-MM-DD') });


    }

    // Pull the totals by certificate for this user to return to them.
    const [results] = await global.db.query(
      `SELECT t.id, t.name, count(*) total
         FROM certificate t LEFT OUTER JOIN  challenge c on c.certificateID = t.id,
              userChallenge u
        WHERE u.challengeID = c.id
          AND u.userID = :userID
        group by t.id, t.name`,
      { userID: userID });

    return results;
  }

  static async getMe(ctx) {
    const userID = ctx.state.user.id;
    ctx.body = await User.get(userID);
  }

  static async getUser(ctx) {
    const userID = ctx.params.userID;
    ctx.body = await User.get(userID);
  }

  static async get(id) {
    const user = {
      info: {},
      challenges: [],
    };
    [[user.info]] = await global.db.query(
      `SELECT * 
        FROM user 
        WHERE id = :id`,
      {id}
    );
    user.info.password = null;

    [user.challenges] = await global.db.query(
      `SELECT c.name, uc.updated, uc.completed
        FROM userChallenge AS uc, challenge AS c
        WHERE uc.userID = :id
        AND uc.challengeID = c.id`,
      {id}
    );

    user.challengeCount = user.challenges.length;


    return user;
  }

  static async getAllAdmin(ctx) {
    const teamWhere = '';
    if (ctx.state.user.role !== 4) {
      ctx.body = [];
      return;
    }
    const [users] = await global.db
      .query(`SELECT u.id, u.email, u.fname, u.lname, u.role, u.status, u.teamID, t.name as teamName, t.code as code, u.billingDay, u.billingRate, IF(u.customerID, 1, 0) as billable
                                             FROM user u left join team t on u.teamID = t.id
                                            ORDER BY id desc, teamName`);

    for (const i in users) {
      const [[b]] = await global.db.query(
        'SELECT * from userBilling where userID = ? order by id desc limit 1',
        [users[i].id]
      );

      if (b) {
        users[i].lastBilling = `${b.billingRate} on ${b.billingMonth}/${
          b.billingDay
          }`;
      } else {
        users[i].lastBilling = '';
      }
    }
    ctx.body = users;
  }

  static async getAll(ctx) {
    let teamWhere = '';
    if (ctx.state.user.role < 3) {
      const [[myTeamID]] = await global.db.query(
        `Select teamID from user where ID = ${ctx.state.user.id}`
      );
      teamWhere = `WHERE teamID = ${myTeamID.teamID}`;
    }
    const [users] = await global.db
      .query(`SELECT u.id, u.email, u.fname, u.lname, u.role, u.status, u.teamID, t.name as teamName, t.code as code
                                             FROM team t left join user u on u.teamID = t.id
                                            ${teamWhere}
                                            ORDER BY teamName, lname, fname`);
    let curCode = 'z4rde#'; //Gibberish to avoid ever matching on the first round
    const outTeams = [];
    let curTeam = {};
    users.forEach(user => {
      //console.log(user);
      if (user.code != curCode) {
        //This is a new team, set it up
        curCode = user.code;
        if (curTeam.name) {
          outTeams.push(curTeam);
          curTeam = {};
        }
        curTeam.name = user.teamName;
        curTeam.code = user.code;
        curTeam.users = [];
      }
      curTeam.users.push(user);
    });
    outTeams.push(curTeam);

    ctx.body = outTeams;
  }

  static async getTeams(ctx) {
    const [teams] = await global.db.query('Select * From team');
    ctx.body = teams;
  }

  static async getRoles(ctx) {
    const [roles] = await global.db.query(
      'Select * From userRole order by id asc;'
    );
    ctx.body = roles;
  }

  static async addTeam(ctx) {
    const result = await global.db.query(
      'insert into team (name, maxUsers, status) values (:teamName, 0, 1)',
      {
        teamName: ctx.request.body.name,
      }
    );
    const id = result[0].insertId;
    let done = false;
    while (!done) {
      try {
        const code = makeCode();
        const res = await global.db.query(
          'update team set code = :code where id = :id',
          {code: code, id: id}
        );
        done = true;
      } catch (e) {
        console.log('error!!!', e);
        done = false;
      }
    }

    ctx.body = result;
  }

  static async adminUpdate(ctx) {
    console.log(ctx.request.body);
    let password = '';
    if (
      ctx.request.body.password !== '' &&
      ctx.request.body.password !== undefined
    ) {
      while (password.length < 10) {
        password = scrypt.kdfSync(ctx.request.body.password, {
          N: 16,
          r: 8,
          p: 2,
        });
      }

      await global.db.query(
        'update user set password = :password where id = :id',
        {
          id: ctx.request.body.id,
          password: password,
        }
      );
    }

    ctx.body = await global.db.query(
      'update user set fname = :fname, lname = :lname, email = :email, billingDay = :billingDay, billingRate = :billingRate, status = :status, role = :role where id = :id',
      {
        fname: ctx.request.body.fname,
        lname: ctx.request.body.lname,
        email: ctx.request.body.email,
        billingDay: ctx.request.body.billingDay,
        billingRate: ctx.request.body.billingRate,
        status: ctx.request.body.status,
        role: ctx.request.body.role,
        id: ctx.request.body.id,
      }
    );
  }

  static async save(ctx) {
    console.log(ctx.request.body);
    if (ctx.request.body.password && ctx.request.body.password.length > 3) {
      let newPassword = '';
      while (newPassword.length < 10) {
        newPassword = scrypt.kdfSync(ctx.request.body.password, {
          N: 16,
          r: 8,
          p: 2,
        });
      }
      const resultPass = await global.db.query(
        'update user set password = :password where id = :id',
        {
          id: ctx.request.body.id,
          password: newPassword,
        }
      );
      console.log(ctx.request.body.id);
      console.log(newPassword);
    }
    const result = await global.db.query(
      'update user set email = :email, fname = :fname, lname = :lname, role = :role, status = :status, teamID = :teamID where id = :id',
      {
        id: ctx.params.userID,
        email: ctx.request.body.email,
        fname: ctx.request.body.fname,
        lname: ctx.request.body.lname,
        role: ctx.request.body.role,
        status: ctx.request.body.status,
        teamID: ctx.request.body.teamID,
      }
    );
    ctx.body = result;
  }

  static async deleteUser(ctx) {
    const result = await global.db.query('delete from user where id = :id', {
      id: ctx.params.userID,
    });
    ctx.body = result;
  }

  static async getBy(field, value) {
    try {
      const sql = `Select u.*
                     From user u 
                    Where u.${field} = :${field} 
                    Order By u.fname, u.lname`;
      const [users] = await global.db.query(sql, {[field]: value});

      return users;
    } catch (e) {
      switch (e.code) {
        case 'ER_BAD_FIELD_ERROR':
          throw new ModelError(403, 'Unrecognised User field ' + field);
        default:
          Lib.logException('User.getBy', e);
          throw new ModelError(500, e.message);
      }
    }
  }

  static async addToken(userID, refreshToken) {
    const sql = 'insert into userToken (userID, refreshToken) values (:userID, :refreshToken)';
    const ret = await global.db.query(sql, {
      userID: userID,
      refreshToken: refreshToken,
    });
    return ret;
  }

  static async getByToken(token) {
    const sql = `Select u.*, t.id as teamID, t.name as teamName, t.sharedData 
                     From user u 
                          left outer join team t on u.teamID = t.id
                  Where u.id in (select userID from userToken where refreshToken = :token)`;
    const [users] = await global.db.query(sql, {token: token});

    const sql2 = 'delete from userToken where refreshToken = :token'; //This token has been used, remove it.
    const res = await global.db.query(sql2, {token: token});

    return users;
  }

  static async register(ctx) {
    let result;

    console.log(ctx.request.body);
    if (!ctx.request.body.password && !ctx.request.body.email) {
      ctx.request.body = JSON.parse(ctx.request.body);
    }

    try {
      let newPassword = '';
      while (newPassword.length < 10) {
        newPassword = scrypt.kdfSync(ctx.request.body.password, {
          N: 16,
          r: 8,
          p: 2,
        });
      }
      [result] = await global.db.query(
        'insert into user (fname, lname, email, password, fccCode, role, status) values (:fname, :lname, :email, :password, :fccCode, :role, :status)',
        {
          fname: ctx.request.body.fname,
          lname: ctx.request.body.lname,
          email: ctx.request.body.email,
          password: newPassword,
          fccCode: ctx.request.body.fccCode,
          role: 1,
          status: 1,
        }
      );
    } catch (e) {
      console.log('error', e);
      result = [{error: 1}];
    }

    ctx.body = result;
  }

  static async validateCode(ctx) {
    let result = [];
    try {
      [result] = await global.db.query(
        'select id, name from team where code = :code',
        {code: ctx.params.code}
      );
    } catch (e) {
      result = [{id: 0}];
    }
    if (!result[0]) {
      result = [{id: 0}];
    }
    ctx.body = result[0]; //Return only the ID
  }

  static async checkInvite(ctx) {
    // Empty variables
    let result = {};
    let team = {};

    console.log('here');

    // Fetches an id from teamInvite with a given email
    try {
      [[team]] = await global.db.query(
        'select id, name from team where id = (select teamId from teamInvite where email = :email)',
        {email: ctx.request.body.email}
      );

      // If there's a team ID...
      if (team.id) {
        // return the team name
        result = {name: team.name, id: team.id};
      } else {
        // Else, return null
        result = {name: null, id: null};
      }
    } catch (e) {
      result = {name: null, id: null};
    }

    // Set the response body
    ctx.body = result;
  }

  static async testEmail(ctx) {
    let result;

    try {
      [[result]] = await global.db.query(
        'select id from user where email = :email',
        {email: ctx.request.body.email}
      );
    } catch (e) {
      console.log('testEmail error', e);
      result = {id: 0};
    }
    if (!result) {
      result = {id: 0};
    }
    ctx.body = result; //Return only the ID
  }

  static async scrapeCurriculum(ctx) {
    await doScrapeCurriculum();
  }
}

async function doScrapeCurriculum() {
  const url = 'https://learn.freecodecamp.org/';
  const page = await global.browser.newPage();
  await page.goto(url);
  await page.waitForSelector('#___gatsby > div > main > div > div.map-ui > ul');

  const out = [];

  for (let i = 1; ; i++) {

    out[i - 1] = {};

    out[i - 1].cert = await page.evaluate((i) => {
      try {
        return document.querySelector(`#___gatsby > div > main > div > div.map-ui > ul > li:nth-child(${i}) > div > h4`).textContent;
      } catch (e) {
        return false;
      }
    }, i);

    if (!out[i - 1].cert) {
      break;
    }

    if (i > 1) {
      await page.click(`#___gatsby > div > main > div > div.map-ui > ul > li:nth-child(${i}) > div > h4`);
    }

//creates array
    out[i - 1].subs = [];

    for (let j = 1; ; j++) {
      out[i - 1].subs[j - 1] = {};
      const subHead = await page.evaluate((i, j) => {
        try {
          return document.querySelector(`#___gatsby > div > main > div > div.map-ui > ul > li:nth-child(${i}) > ul > li:nth-child(${j}) > div > h5`).textContent;
        } catch (e) {
          return false;
        }
      }, i, j);

      if (!subHead) {
        break;
      }

      out[i - 1].subs[j - 1].title = subHead;

      if (i > 1 || (i === 1 && j > 1)) {
        await page.click(`#___gatsby > div > main > div > div.map-ui > ul > li:nth-child(${i}) > ul > li:nth-child(${j}) > div > h5`);
      }

      out[i - 1].subs[j - 1].stuff = [];

      for (let k = 2; ; k++) {
        const subSub = await page.evaluate((i, j, k) => {
          try {
            return document.querySelector(`#___gatsby > div > main > div > div.map-ui > ul > li:nth-child(${i}) > ul > li:nth-child(${j}) > ul > li:nth-child(${k}) > a`).textContent;
          } catch (e) {
            return false;
          }
        }, i, j, k);

        if (!subSub) {
          break;
        }

        out[i - 1].subs[j - 1].stuff.push(subSub);

      }
    }
  }

  console.log(out);

  for (const o of out) {
    try {
      if (!Number(o.cert)) continue;
      const [cert] = await global.db.query(`INSERT INTO certificate (name) 
                                          VALUES (:name)
                                          ON DUPLICATE KEY UPDATE name = :name`,
        {name: o.cert});
      const certificateID = cert.insertId;
      if (!o.subs || !o.subs.length) continue;
      for (const s of o.subs) {
        console.log('subs', s);
        if (!s.title) continue;
        try {
          const [subs] = await global.db.query(`INSERT INTO certSub (certificateID, name) 
                                            VALUES (:certificateID, :name)
                                            ON DUPLICATE KEY UPDATE name = :name, certificateID = :certificateID`,
            {certificateID: certificateID, name: s.title});
          const certsubID = subs.insertId;
          for (const t of s.stuff) {
            try {
              const [stuff] = await global.db.query(`INSERT INTO challenge (certificateID, certSubID, name) 
                                               VALUES (:certificateID, :certsubID, :name)
                                               ON DUPLICATE KEY UPDATE name = :name, certificateID = :certificateID, certSubID = :certSubID`,
                {certificateID: certificateID, certsubID: certsubID, name: t});
            } catch (e) {
              console.log('challenge insert error', e);
            }
          }
        } catch (e) {
          console.log('subCert insert error', e);
        }

      }
    } catch (e) {
      console.log('certificate insert error', e);
    }

  }
}

const makeCode = function () {
  let text = '';
  const possible = 'BCDFGHJKLMNPQRSTVWXYZ0123456789';
  for (let i = 0; i < 6; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = User;
