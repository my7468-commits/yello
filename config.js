/* 共用設定：訂位與菜單都透過這個 Google Apps Script Web App 網址溝通。
   部署或重新部署後，只需要改這一個地方，booking.html 和 menu.html 會一起套用。

   注意：菜單管理密碼「不」放在這個檔案裡（放這裡任何人打開網頁原始碼都看得到）。
   密碼只設定在 google-apps-script.gs 裡的 MENU_ADMIN_PASSWORD，
   店家要編輯菜單時，在 menu.html 開啟管理模式時輸入即可，不會存進檔案中。
   這只是基本防呆機制，不是正式帳號安全機制，請勿用於機密用途。 */
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbz56bFTNGeZhHaouxmpLVBcfBthKkAXqHe1yHa4RrUtRbJOOd6uFyC-ibXQFkC0tAKl3w/exec";
