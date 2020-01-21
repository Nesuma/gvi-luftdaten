# Feinstaub-Wind Server

Aktuelle Darstellung der Feinstaub und Winddaten.

## Eigenen Feinstaub und Windserver starten
In der Konsole folgendes eingeben:
```bash
cd server
npm install
node server.js
```
Dadurch wird ein lokaler Server auf localhost:300 erzeugt.  
Durch den Aufruf von http://localhost:3000/ im Browser lässt sich die Karte anzeigen.

## Wind-JS-Server starten:

In einer neuen Konsole folgendes eingeben:
```bash
cd wind-js-server-master
npm install
npm start
```
Dann wird ein lokaler Windserver auf localhost:7000 gestartet.  

<strong>Achtung:</strong> Hierfür wird Java benötigt. (Die Konvertierung der grib2 Files läuft über eine Java Applikation)
