# How to Utilize the Performance Tests

## To run all performance tests (i.e. all files ending in .test.ts):
1. run the command "npm run test:frontend:performance"

## To change the iModel or view:
1. Find the configuration section
2. Change the iModelName value to access a different imodel
3. Change the viewName value to use a different view

## To get performance data:
1. To set the path of the csv file that holds the performance data, change the 'resultsLocation' variable to the path you wish to use. It is currently set to "D:\\output\\performanceData\\".
2. To set the file name of the csv file that holds the performance data, change the 'resultsFileName' variable to the path you wish to use. It is currently set to "performanceResults_new.csv".
3. Run the performance tests. The performance data gathered during the tests will be saved in the file specified. If that file path or the file itself does not already exist, it will be created. If the file does already exist, the new data gathered will be added to it.

## To save a png of what is currently being rendered:
1. Add a savePng() function call in the PerformanceTests.test.ts file.
2. To set the name the png will be saved as, change the string given to the writeFile() function. It currently will be saved as "image2.png" and the file will be saved in test-apps/testbed.
3. Now, when you run the performance tests, anywhere you called the savePng() function will save what is currently being rendered onscreen.
