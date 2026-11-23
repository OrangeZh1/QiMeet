ALTER TABLE site_settings ADD COLUMN check_in_help MEDIUMTEXT NULL;

UPDATE site_settings
SET check_in_help = '## 到场后如何签到

在活动规定的签到时段，用微信或手机相机扫描现场签到码，登录后按页面提示确认。

如果活动开放了手机签到，可以从活动详情页或「我的 → 待签到」进入。

## 找不到报名记录

请使用报名时的账号登录。换手机后也可以登录原账号，或在登录后按提示凭报名信息找回记录。

## 签到遇到问题

请确认活动、签到环节和开放时间。如果二维码已失效，请扫描现场更新后的签到码。仍无法完成时，请向现场工作人员求助。'
WHERE id=1 AND check_in_help IS NULL;
