#!/bin/zsh
cp $OutRoot/LinuxX64/packages/imodeljs-native-platform-api/*          ./common/temp/node_modules/@bentley/imodeljs-native-platform-api
mkdir -p ./tools/native-platform-installer/node_modules/@bentley/imodeljs-native-platform-api
cp $OutRoot/LinuxX64/packages/imodeljs-native-platform-api/*          ./tools/native-platform-installer/node_modules/@bentley/imodeljs-native-platform-api
cp -r $OutRoot/LinuxX64/packages/imodeljs-n_8-linux-x64               ./common/temp/node_modules/@bentley
cp -r $OutRoot/LinuxX64/packages/imodeljs-n_8-linux-x64               ./tools/native-platform-installer/node_modules/@bentley
# cp -r $OutRoot/LinuxX64/packages/imodeljs-e_2-linux-x64               ./common/temp/node_modules/@bentley
# cp -r $OutRoot/LinuxX64/packages/imodeljs-e_2-linux-x64               ./tools/native-platform-installer/node_modules/@bentley