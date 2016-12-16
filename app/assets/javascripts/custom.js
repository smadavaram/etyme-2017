function flash_alert(color , msg){
    $.smallBox({
        title : msg,
        //content : "<i class='fa fa-clock-o'></i> <i>2 seconds ago...</i>",
        color : color,
        iconSmall : "fa fa-thumbs-up bounce animated",
        timeout : 4000
    });
}
function flash_error(msg)
{
    $error    = '#D04B2B';
    flash_alert($error,msg);
}
function flash_success(msg)
{
    var $success  = '#739E73';
    flash_alert($success,msg);
}
function flash_info(msg)
{
    var $info     = '#35A4DA';
    flash_alert($info,msg);
}
function flash_notice(msg)
{
    var $notice   = '#80C14B';
    flash_alert($notice,msg);
}
function alert_alert(msg)
{
    var $alert    = '#FFC333';
    flash_alert($alert,msg);
}