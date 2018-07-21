const fr = require('face-recognition');
const detector = fr.FaceDetector();
const recognizer = fr.FaceRecognizer();
const { lstatSync, readdirSync } = require('fs')
const imageFolder = './images/'
const isDirectory = source => lstatSync(source).isDirectory()
const isNotDirectory = source => !lstatSync(source).isDirectory()
const { join } = require('path')

class Util {

  static async getRoot(ctx){
    // root element just returns uri's for principal resources (in preferred format)
    const authentication = '‘POST /auth’ to obtain JSON Web Token; subsequent requests require JWT auth as a bearer token.';
    ctx.body = { authentication: authentication };
  }

  // static async train(ctx) {
  //   const training = [];
  //
  //   // Find all of the image folders
  //   const getDirs = source =>
  //     readdirSync(imageFolder)
  //       .map(name => join(imageFolder, name))
  //       .filter(isDirectory);
  //   const dirs = getDirs();
  //
  //   // Go through all of them and build up the training array with names and found faces.
  //   dirs.map(dir => {
  //     const name = dir.split('/')[1].replace(/_/g, ' ');
  //     const train = {name: name, faces: []};
  //     console.log(name);
  //     const files = readdirSync(dir)
  //       .map(name => join(dir, name))
  //       .filter(isNotDirectory);
  //     files.map(file => {
  //       console.log(`testing: ${file}`);
  //       const faces = detector.detectFaces(fr.loadImage(file));
  //       if (faces.length) {
  //         for (const face of faces) {
  //           train.faces.push(face);
  //         }
  //       }
  //     });
  //     training.push(train);
  //   });
  //
  //   // Now train on the found faces.
  //   const save = training.map(train => {
  //     console.log(`Training for ${train.name}`);
  //     recognizer.addFaces(train.faces, train.name, 15);
  //     const modelState = JSON.stringify(recognizer.serialize());
  //     global.db.query('insert into face (name, model) values (:name, :model)', {name: train.name, model: modelState});
  //   });
  //
  //
  // }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Util;
