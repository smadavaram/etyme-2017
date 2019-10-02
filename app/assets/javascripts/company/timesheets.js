$('.ts').on('click',function (e) {
    $('#ts_tag').val(e.target.text)
    $('#timesheets').submit()
})