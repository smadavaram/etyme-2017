function import_company_customers_file(url, type) {
    file_url = url
    $.ajax({
        type: 'POST',
        url: "/company/customer_vendor.js",
        data: {file_type: 'customer', file: file_url, authenticity_token: window._token},
    });
}

function company_customer_file() {
    upload_file_ajax(import_company_customers_file);
}

function import_vendor_customers_file(url, type) {
    file_url = url
    $.ajax({
        type: 'POST',
        url: "/company/customer_vendor.js",
        data: {file_type: 'vendor', file: file_url, authenticity_token: window._token},
    });
}

function company_vendor_file() {
    upload_file_ajax(import_vendor_customers_file);
}

$(".close_slick").click(function () {
    $('.popup-backgroud').hide();
    $('.popup-container').hide()
});
$("#slideshow").slick({
    infinite: false,
    arrows: true,
    prevArrow: "<span class='next'><i class='icon-feather-arrow-left'> Previous</i></span>",
    nextArrow: "<span class='pre'>&nbsp; Next<i class='icon-feather-arrow-right'></i></span>"
    // autoplay: true,
});

$("#slideshow").on('beforeChange', function (event, slick, currentSlide, nextSlide) {
    if (currentSlide < nextSlide) {
        var slider = $($('.slide')[currentSlide]);
        if (!!slider.find('#emails').val()) {
            slider.find('form').submit();
        }
    }
});
