'use strict';
const randomstring = require('randomstring');

class Util {

  static async getRoot(ctx){
    // root element just returns uri's for principal resources (in preferred format)
    const authentication = '‘POST /auth’ to obtain JSON Web Token; subsequent requests require JWT auth as a bearer token.';
    ctx.body = { authentication: authentication };
  }

  static async version(ctx) {
    try {
      let sqla = `select * from version order by id desc limit 1`;
      const [[version]] = await global.db.query(sqla);
      ctx.body = version.version;
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
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Util;
