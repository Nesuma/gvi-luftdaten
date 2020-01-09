const express = require('express');
const fs = require('fs');
const {promisify} = require('util');
const request = require('request');
const request_promise = require('request-promise-native');
// const fs = require('fs').promises; // makes file reading work with async / await
const $ = require('jquery');
const app = express();
const port = 3000;
const readFileAsync = promisify(fs.readFile);

let separator = ';';


let dateIndex = 1;
let speedIndex = 3;
let directionIndex = 4;

// let sensors = {};

//https://learnscraping.com/how-to-download-files-with-nodejs-using-request/
// Sensor 13463

async function getDustSensorIds(area) {
    let options = {uri: "https://data.sensor.community/airrohr/v1/filter/area=" + area, json: true};
    let ids = [];
    let rp = await request_promise(options);

    for (measurment of rp) {
        ids.push(measurment.sensor.id);
    }
    return ids;
}

let id = [];

function getIds() {
    $.getJSON('https://data.sensor.community/airrohr/v1/filter/area=48.8,9.2,10', function (data) {
        data.forEach(element => {
            id.push(element.id)
        });
        console.log(id);
    })
}

async function downloadCSV(date, sensorId, outputPath) {
    let filename = date.toString() + "_sds011_sensor_" + sensorId + ".csv";
    /* Create an empty file where we can save data */
    let file = fs.createWriteStream(outputPath + filename);
    /* Using Promises so that we can use the ASYNC AWAIT syntax */
    await new Promise((resolve, reject) => {
        let stream = request({
            /* Here you should specify the exact link to the file you are trying to download */
            uri: 'http://archive.luftdaten.info/' + date + '/' + filename,
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,ro;q=0.7,ru;q=0.6,la;q=0.5,pt;q=0.4,de;q=0.3',
                'Cache-Control': 'max-age=0',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
            },
            /* GZIP true for most of the websites now, disable it if you don't need it */
            gzip: true
        })
            .pipe(file)
            .on('finish', () => {
                console.log(`The file is finished downloading.`);
                resolve();
            })
            .on('error', (error) => {
                reject(error);
            })
    })
        .catch(error => {
            console.log(`Something happened: ${error}`);
        });
}

class DustSensor {
    constructor() {
    }
}

class WindSensor {
    constructor(content) {
        this.measures = {};
    }

    addDatapoint(year, month, day, hour, minutes, speed, direction) {
        if (this.measures[year] === undefined) {
            this.measures[year] = {};
        }
        if (this.measures[year][month] === undefined) {
            this.measures[year][month] = {};
        }
        if (this.measures[year][month][day] === undefined) {
            this.measures[year][month][day] = {};
        }
        if (this.measures[year][month][day][hour] === undefined) {
            this.measures[year][month][day][hour] = {};
        }
        if (this.measures[year][month][day][minutes] === undefined) {
            this.measures[year][month][day][minutes] = {};
        }
        this.measures[year][month][day][hour][minutes] = {speed: speed, direction: direction};
        // console.log(this.measures);
        // console.log("added: " + year + "-" +month+ "-" +day+ "-" +hour+ "-" + minutes + "-" +speed+ "-" +direction)
        // console.log(this.measures[year][month][day][hour][minutes]);
    }


    storeMeasurements(content) {
        let yearDetail = 4;
        let monthDetail = 2;
        let dayDetail = 2;
        let hourDetail = 2;
        let minutesDetail = 2;

        for (let line of content) {
            // console.log("line: " + line);
            let attributes = line.split(separator);

            let date = attributes[dateIndex];
            let speed = parseFloat(attributes[speedIndex]);
            let direction = parseInt(attributes[directionIndex]);

            // console.log("date: " + date + " speed: " + speed + " direction: " + direction);

            let currentIndex = 0;
            let year = parseInt(date.substring(currentIndex, yearDetail));
            currentIndex += yearDetail;

            let month = parseInt(date.substring(currentIndex, currentIndex + monthDetail));
            currentIndex += monthDetail;

            let day = parseInt(date.substring(currentIndex, currentIndex + dayDetail));
            currentIndex += dayDetail;

            let hour = parseInt(date.substring(currentIndex, currentIndex + hourDetail));
            currentIndex += hourDetail;

            let minutes = parseInt(date.substring(currentIndex, currentIndex + minutesDetail));

            // console.log("year: " + year+" month: "+month+" day: "+day+" hour: "+hour+" minutes: " + minutes);

            this.addDatapoint(year, month, day, hour, minutes, speed, direction);

        }
    }
}

function extractSensorId(id) {
    // produkt_ff_stunde_20180707_20200107_04928.txt
    return parseInt(id.substring(id.lastIndexOf("_") + 1, id.indexOf('.')));
}

function readFiles(dirname) {

    let filenames = fs.readdirSync(dirname); // collects file names in directory (sync)
    let dataPromises = {};
    for (let filename of filenames) {
        dataPromises[filename] = readFileAsync(dirname + filename, 'utf-8'); // async read call returns promise
    }
    return dataPromises;
}

async function getWindSensorData(dataPromise) {
    // console.log("waiting for data promise");
    // console.log(dataPromise);
    const data = await dataPromise;
    let content;
    content = data.substring(data.indexOf("\n") + 1); // remove first line
    content = content.substring(0, content.lastIndexOf("\n")); // remove last line
    return content.split("\n");
    // console.log(sensor);
}


async function getWindSensors() {
    let sensors = {};
    const dataPromises = readFiles('../data/wind/');

    let sensorPromises = {};
    // console.log("data promises: ");
    // console.log(dataPromises);

    for (const [filename, dataPromise] of Object.entries(dataPromises)) {
        sensorPromises[filename] = getWindSensorData(dataPromise);
    }
    // console.log("sensor promises: ");
    // console.log(sensorPromises);
    for (const [filename, sensorPromise] of Object.entries(sensorPromises)) {
        let numId = extractSensorId(filename);
        if (sensors[numId] === undefined) {
            sensors[numId] = new WindSensor();
        }
        sensors[numId].storeMeasurements(await sensorPromise);
    }

    console.log(sensors);
    return sensors;
}

async function startWindAPI(sensorsPromise) {
    let sensors = await sensorsPromise;
    console.log(sensors);
    let windDocumentation = "There are multiple stations:";

    app.get('/wind', (req, res) => {
        let doc = windDocumentation;
        for (const [key, value] of Object.entries(sensors)) {
            doc += "\n" + key;
        }
        res.send(doc);
    });

    app.get('/wind/:stationId', (req, res) => {
        res.send("Ask like this: http://localhost:3000/wind/4928/2020-1-8-16-20");
    });

    app.get('/wind/:stationId/:year-:month-:day-:hour-:minutes', (req, res) => {
        station = req.params['stationId'];
        year = req.params['year'];
        month = req.params['month'];
        day = req.params['day'];
        hour = req.params['hour'];
        minutes = req.params['minutes'];
        let sensor;
        try {
            sensor = sensors[station].measures[year][month][day][hour][minutes];
            // somehow necessary because hour: 30 40 50 ... and minutes 2 3 4 ... 200 300 400 all don't throw an error but are undefined
            // couldn't reproduce it with month
            if (sensor === undefined) {
                throw new Error();
            }
        } catch (err) {
            res.status(404);
            res.send("Station " + station + " or date [" + day + "." + month + "." + year + " " + hour + ":" + minutes + "] unknown");
        }

        res.send(sensor);
    });
}

async function getDustSensorData() {

}

async function startDustAPI() {
    let sensors = {};

    // const dataPromises = readFiles('../data/dust/');
    //
    // let sensorPromises = {};
    // // console.log("data promises: ");
    // // console.log(dataPromises);
    //
    // for (const [filename, dataPromise] of Object.entries(dataPromises)) {
    //     sensorPromises[filename] = getDustSensorData(dataPromise);
    // }
    // // console.log("sensor promises: ");
    // // console.log(sensorPromises);
    // for (const [filename, sensorPromise] of Object.entries(sensorPromises)) {
    //     let numId = extractSensorId(filename);
    //     if (sensors[numId] === undefined){
    //         sensors[numId] = new WindSensor();
    //     }
    //     sensors[numId].storeMeasurements(await sensorPromise);
    // }
    //
    // console.log(sensors);
    // let windDocumentation = "There are multiple stations:";
    //
    // app.get('/wind', (req, res) => {
    //     let doc = windDocumentation;
    //     for (const [key, value] of Object.entries(sensors)) {
    //         doc += "\n" + key;
    //     }
    //     res.send(doc);
    // });
    //
    // app.get('/wind/:stationId', (req, res) => {
    //     res.send("Ask like this: http://localhost:3000/wind/4928/2020-1-8-16-20");
    // });
    //
    // app.get('/wind/:stationId/:year-:month-:day-:hour-:minutes', (req, res) => {
    //     station = req.params['stationId'];
    //     year = req.params['year'];
    //     month = req.params['month'];
    //     day = req.params['day'];
    //     hour = req.params['hour'];
    //     minutes = req.params['minutes'];
    //     let sensor;
    //     try {
    //         sensor = sensors[station].measures[year][month][day][hour][minutes];
    //         // somehow necessary because hour: 30 40 50 ... and minutes 2 3 4 ... 200 300 400 all don't throw an error but are undefined
    //         // couldn't reproduce it with month
    //         if (sensor === undefined) {
    //             throw new Error();
    //         }
    //     } catch (err) {
    //         res.status(404);
    //         res.send("Station " + station + " or date [" + day + "." + month + "." + year + " " + hour + ":" + minutes + "] unknown");
    //     }
    //
    //     res.send(sensor);
    // });
}

async function startAPI() {
    const sensorsPromise = getWindSensors();
    startWindAPI(sensorsPromise);

    let outputPath = "../data/dust";
    let ids = await getDustSensorIds('48.8,9.2,10');
    let sensors = await sensorsPromise; //  necessary so that all wind dates are read, hopefully one can await twice
    for (let key in sensors) {
        let sensor = sensors[key];
        for (let year in sensor.measures) {
            console.log("year: " + year);
            for (let month in sensor.measures[year]) {
                let twoDigitMonth; // march is written like 03 but 03 is not defined in months
                if (month < 10) {
                    twoDigitMonth = "0" + month;
                }
                for (let day in sensor.measures[year][month]) {
                    // this works because it is not used as object key
                    if (day < 10) {
                        day = "0" + day;
                    }
                    let date = "" + year + "-" + twoDigitMonth + "-" + day;
                    for (let id of ids) {
                        console.log(date + " " + id);
                        // downloadCSV(date,id,outputPath);
                    }
                    // for (let hour of sensor.measures[year][month][day].keys()){
                    //     for (let minute of sensor.measures[year][month][day][hour].keys()){
                    //
                    //     }
                    // }
                }
            }
        }

    }
    downloadCSV("2019-12-31", "553", "../data/dust/");
    // startDustAPI();


    app.get('/', (req, res) => res.send("Wind and Dust Archive API"));

}

startAPI();


//app.get('/air', (req,res) =>{

//}

app.listen(port, () => console.log(`Example on port ${port}`));
