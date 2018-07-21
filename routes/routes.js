/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  User routes                                                                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const router = require('koa-router')(); // router middleware for koa
const face = require('../models/face.js');
const fs = require('fs');

router.get('/', face.getRoot); // get all users
router.get('/train/', face.train); // get all users
router.post('/find/', require('koa-body')({
    formidable: {
      uploadDir: './file_uploads',
      keepExtensions: true
    },
    multipart: true,
    urlencoded: true
  }), face.find);

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
