const fr = require('face-recognition');
const detector = fr.FaceDetector();
const recognizer = fr.FaceRecognizer();
const { lstatSync, readdirSync } = require('fs')
const imageFolder = './images/training/'
const isDirectory = (source) => lstatSync(source).isDirectory()
const isNotDirectory = (source) => {
  if (!lstatSync(source).isDirectory() && source.substr(-4) === '.jpg') return true;
  return false;
}
const { join } = require('path')

class Face {

  static async getRoot(ctx){
    // root element just returns uri's for principal resources (in preferred format)
    const authentication = '‘POST /auth’ to obtain JSON Web Token; subsequent requests require JWT auth as a bearer token.';
    ctx.body = { authentication: authentication };
  }

  static async find(ctx) {

    const image = fr.loadImage(ctx.request.body.files.file.path);
    const faces = detector.detectFaces(image);

    const out = [];
    const [[model]] = await ctx.state.db.query('select * from model order by time desc limit 1');
    const modelState = JSON.parse(model.model);
    recognizer.load(modelState);

    // const prediction = recognizer.predictBest(image);

    faces.map(face => {
      const bestPrediction = recognizer.predictBest(face);
      if (bestPrediction.distance <= .6) out.push(bestPrediction);
      else out.push({className: 'unknown'});
    });
    ctx.body = out;

  }

  static async train(ctx) {
    const training = [];

    // Find all of the image folders
    const getDirs = source =>
      readdirSync(imageFolder)
        .map(name => join(imageFolder, name))
        .filter(isDirectory);
    const dirs = getDirs();

    // Go through all of them and build up the training array with names and found faces.
    dirs.map(dir => {
      const name = dir.split('/')[2].replace(/_/g, ' ');
      global.db.query('insert into face (name) values (:name) on duplicate key update name = :name', {name: name});
      const train = {name: name, faces: []};
      console.log(name);
      const files = readdirSync(dir)
        .map(name => join(dir, name))
        .filter(isNotDirectory);
      files.map(file => {
        console.log(`processing: ${file}`);
        const faces = detector.detectFaces(fr.loadImage(file));
        faces.map(face => {
          train.faces.push(face);
        });
      });
      training.push(train);
    });

    // Now train on the found faces.
    const save = training.map(train => {
      console.log(`Training for ${train.name}`);
      recognizer.addFaces(train.faces, train.name, 15);
    });
    const modelState = JSON.stringify(recognizer.serialize());
    global.db.query('insert into model (model, time) values (:model, NOW())', {model: modelState});

  }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Face;
