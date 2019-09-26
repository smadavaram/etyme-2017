function flash(color, msg, icon,time=null) {
    $.smallBox({
        title: msg,
        // content : "<i class='fa fa-clock-o'></i> <i>2 seconds ago...</i>",
        color: color,
        iconSmall: icon + " bounce animated",
        timeout: !!time ? time : 4000
    });
}

function flash_error(msg) {
    $error = '#D04B2B';
    flash($error, msg, 'fa fa-exclamation-triangle');
}

function flash_success(msg,time= null) {
    var $success = '#80C14B';
    flash($success, msg, 'fa fa-check',time);
}

function flash_info(msg) {
    var $info = '#35A4DA';
    flash($info, msg, 'fa fa-info');
}

function flash_notice(msg) {
    var $notice = '#80C14B';
    flash($notice, msg, 'fa fa-thumbs');
}

function flash_alert(msg) {
    var $alert = '#FFC333';
    flash($alert, msg, 'fa fa-exclamation-triangle');
}

$(document).ready(function () {

    $('#quick-add').on('click',function (e) {
        $(this).find('.project-dropdown').toggle();
    })


    $('.p_date').datepicker({dateFormat: "yy-mm-dd"});
    $('.p_time').timepicker({template: false, showInputs: false, minuteStep: 5});

    $("#status").on('click', function () {
        $('#status-menue').toggle();
    });
    $("#type").on('click', function () {
        $('#type-menu').toggle();
    });
    var coll = document.getElementsByClassName("collapsible-click");
    var i;
    for (i = 0; i < coll.length; i++) {
        coll[i].addEventListener("click", function () {
            $(this).parent()[0].classList.toggle("active");
            var content = $(this).parent()[0].nextElementSibling;
            if (content.style.display === "block") {
                content.style.display = "none";
            } else {
                content.style.display = "block";
            }
        });
    }
    var collapse = document.getElementsByClassName("sidebar_collapsible");
    var i;
    for (i = 0; i < collapse.length; i++) {
        collapse[i].addEventListener("click", function () {
            this.classList.toggle("active");
            var content = this.nextElementSibling;
            if (content.style.display === "block") {
                content.style.display = "none";
            } else {
                content.style.display = "block";
            }
        });
    }

    $(".multi-select2").select2({
        placeholder: $('#' + $('.multi-select2').attr('id')).attr('placeholder'),
        tokenSeparators: [',', ' ']
    })
    $("#comment_body").keypress(function (event) {
        if (event.which == 13) {
            event.preventDefault();
            $("#new_comment").submit();
        }
    });
    if ($('#container-chart').length > 0) {
        $('#container-chart').highcharts({
            colors: ['#53C986', '#334A5E', '#ffc333', '#fb6b5b'],
            chart: {
                type: 'column'
            },
            title: {
                text: 'Timesheet'
            },
            tooltip: {
                pointFormat: '<span>{series.name}</span>: <b>{point.y}</b><br/>'
            },
            subtitle: {
                text: 'Approved Hours / Day'
            },
            xAxis: {
                categories: ['19th Dec', '21th Dec', '22th Dec', '23th Dec', '24th Dec', '25th Dec', '26th Dec', '27th Dec']
            },
            plotOptions: {
                series: {
                    minPointLength: 0,
                    dataLabels: {
                        enabled: true,

                    },
                }
            },
            yAxis: {
                title: {
                    text: 'Days'
                }

            },
            series: [{
                name: 'Total Hours ',
                data: [4, 7, 5, 7, 10, 7, 10, 4.4],
                color: '#3b5998'
            }]
        })
    }
    $('[data-form-prepend]').click(function (e) {
        var obj = $($(this).attr('data-form-prepend'));
        var time_stamp = (new Date()).getTime();
        obj.find('input, select, textarea').each(function () {
            $(this).attr('name', function () {
                return $(this).attr('name').replace('new_record', time_stamp);
            });
        });
        obj.insertBefore(this);
        $('.education_start_year, .education_completion_year, .start_date, .end_date').datepicker({
            autoclose: true,
            todayHighlight: true,
            format: "mm-dd-yy"
        });
        return false;
    });
});

function toggleFields() {
    if ($('#contract_is_commission').val() == "true")
        $("#contract-commision").show();
    else
        $("#contract-commision").hide();

    if ($('#contract_commission_type option:selected').val() == "fixed")
        $(".max-commission").hide();
    else
        $(".max-commission").show();

}

function contractToggleModel() {
    if ($('#contract_toggle_modal_contract_toggle_modal').val() == "true") {
        job_id = $('#toggle_contract_parent_job_id').val();
        contract_id = $('#toggle_contract_parent_contract_id').val();
        url = "/jobs/" + job_id + "/contracts/" + contract_id + "/create_sub_contract"
        console.log(job_id);
        console.log(contract_id);
        $.post(url);
        $("#contract-assign").hide();
        $("#sub_contract_toggle").show();
    } else if ($('#contract_toggle_modal_contract_toggle_modal').val() == "false") {
        $("#contract-assign").show();
        $("#sub_contract_toggle").hide();
    } else {
        $("#contract-assign").hide();
        $("#sub_contract_toggle").hide();
    }
}

$(document).ready(function () {
    // uploader initiation and function

    toggleFields();
    contractToggleModel();
    $("#contract_is_commission , #contract_commission_type").change(function () {
        toggleFields();
    });
    $("#contract_toggle_modal_contract_toggle_modal").change(function () {
        contractToggleModel();
    });
    $("#contract_toggle_modal_contract_toggle_modal").addClass('form-control');
    $('[data-toggle="tooltip"]').tooltip();
    $('[rel="tooltip"]').tooltip();

    $("#chat_topic").change(function () {
        callAjaxSearch('/company/conversations/search', "GET", {
            keyword: $("#conversation-users-search").val(),
            topic: $("#chat_topic").val()
        })
    });

    $("#conversation-users-search").on("keyup", function () {
        callAjaxSearch('/company/conversations/search', "GET", {
            keyword: $("#conversation-users-search").val(),
            topic: $("#chat_topic").val()
        })
    });
});
$(document).on("click", ".remove-multi-fields", function () {
    if ($(this).closest('div.multi-fields').find('div.multi-field-container').length > 1) {
        $(this).closest('div.multi-field-container').remove();
    } else {
        alert("You have to at least one.")
    }
});

$(document).on("click",".chat-close",function(){
  $('.floated-chat-w').remove()
});

function callAjaxSearch(ajax_url, ajax_method, params_data) {
    $.ajax({
        type: ajax_method,
        dataType: "script",
        url: ajax_url,
        data: params_data,
        success: function (data) {
        }
    });
}

$(document).on('trix-initialize', function(){
    let buttonHTML = '<button type="button" onclick="trix_upload()" class="trix-button uploader"'+
    'title="Upload Image" tabindex="-1"><img src="/uploader_win.svg" style=" width: 2.6em; height: 1.6em;max-width: calc(0.8em + 4vw);text-indent: -9999px;"></img></button>'
    $('.trix-button-group--block-tools').find('.uploader')[0] ? null : $('.trix-button-group--block-tools').append(buttonHTML)

});