/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Location routes                                                                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa
const location = require('../models/location.js');

//router.get('/admin/teams', team.adminGetTeams);

//router.put('/team/edit', team.updateTeamMember);
//router.get('/team/:teamID?', team.getTeam);
//router.post('/location', location.addLocation);
//router.put('/team/:teamID', team.updateTeam);
//router.delete('/team/:teamID', team.removeTeam);

//router.post('/location/:locationID/member', location.addUserToLocation);
//router.delete('/team/:teamID/member/:memberID', team.disableTeamMember);
//router.put('/team/:teamID/member/:memberID', team.enableTeamMember);
//router.delete('/team/:teamID/member/:memberID/remove', team.removeTeamMember);
router.get('/location/getLocation', location.getLocationInfo);

//router.post('/team/:teamID/invite', team.inviteToTeam);
//router.put('/team/:teamID/removeInvite', team.removeInvite);

//router.put('/team/:teamID/makeAdmin/:userID/:isAdmin', team.toggleTeamAdmin);

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
