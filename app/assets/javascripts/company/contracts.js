function toogle_consultant(target, selector) {
    if (target.value == "yes") {
        $(selector).show()
    } else {
        $(selector).hide()
    }
}

function toogle_seller(target, selector) {
    if (target.value == "yes") {
        $(selector).show()
    } else {
        $(selector).hide()
    }
}


$(document).ready(function () {
    $(document).on('change', '#sell_contract_company', function (e) {
        var endclientid = $('#select_clients').val();
        if (endclientid) {
            set_company_reporting_manger('#' + 'select_sell_company_contacts', "Please Select Or Add new Contacts-" + endclientid, "#sell_contract_company");
        } else {
            var sell_contract_company = $('#sell_contract_company').val();
            if (sell_contract_company) {
                set_company_reporting_manger('#select_sell_company_contacts', "Please Select Or Add new Contacts-" + sell_contract_company, "#sell_contract_company");
            }
        }
    });

    $(document).on('change', '#select_clients', function (e) {
        var endclientid = $('#select_clients').val();
        if (endclientid) {
            set_company_reporting_manger('#select_sell_company_contacts', "Please Select Or Add new Contacts-" + endclientid, "#sell_contract_company");
        } else {
            var sell_contract_company = $('#sell_contract_company').val();
            if (sell_contract_company) {
                set_company_reporting_manger('#select_sell_company_contacts', "Please Select Or Add new Contacts-" + sell_contract_company, "#sell_contract_company");
            }
        }
    });
    $('input[name="contract[is_client_customer]"]').change(function() {
        if(this.value === "false"){
            var sell_contract_company = $('#sell_contract_company').val();
            if (sell_contract_company) {
                set_company_reporting_manger('#select_sell_company_contacts', "Please Select Or Add new Contacts-" + sell_contract_company, "#sell_contract_company");
            }
        }
    });

});

function cc_color(note){
    switch(note){
        case 'Salary Process':
            return 'red';
        case 'Salary Calculation':
            return 'green';
        case 'Salary Clear':
            return 'blue';
    }
}

function initialize() {
    var input = document.getElementById('google_search_location');
    new google.maps.places.Autocomplete(input);
}

google.maps.event.addDomListener(window, 'load', initialize);
$(function () {
    $('#change_rate_from_date , #change_rate_to_date, #job_end_date,#job_start_date').datepicker({
        dateFormat: 'yy/mm/dd',
        prevText: '<i class="fa fa-chevron-left"></i>',
        nextText: '<i class="fa fa-chevron-right"></i>',
    });
});