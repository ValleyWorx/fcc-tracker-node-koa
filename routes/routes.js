/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  User routes                                                                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa
const user = require('../models/user.js');

router.get('/user/getall', user.getAll); // get all users
router.get('/user/getalladmin', user.getAllAdmin); // get all users
router.get('/user/getroles', user.getRoles); // get all user roles
router.get('/user/getteams', user.getTeams); // get all user
router.get('/user/info', user.info); // get all user roles
router.post('/user/admin', user.adminUpdate); //
router.post('/user/addTeam', user.addTeam); //
router.post('/user/deactivate', user.deactivate);
router.put('/user/reactivate', user.reactivate);
router.delete('/user/:userID', user.deleteUser); // delete a user
router.put('/user/save/:userID', user.save); // update a user
router.put('/user/accept/:teamID', user.acceptInvite); // accept team invite

router.get('/user', user.getMe);

router.get('/user/scrape', user.scrapeUser);
router.get('/user/curriculum', user.scrapeCurriculum);

router.get('/user/:userID', user.getUser);
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
