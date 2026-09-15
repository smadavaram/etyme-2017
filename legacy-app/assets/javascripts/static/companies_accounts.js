jQuery.validator.addMethod("checkurl", function(value, element) {
        // now check if valid url
        return /^(www\.)[A-Za-z0-9_-]+\.+[A-Za-z0-9.\/%&=\?_:;-]+$/.test(value);
    }, "Please enter a valid URL."
);
jQuery.validator.addClassRules({
    checkurl : { checkurl : true }
});
$( "#myform" ).validate({
    rules: {
        field: {
            checkurl: true
        }
    }
});

function showNote() {
    text=$('.company_type').val();
    if(text=="vendor")
    {
        $('#company_type').text("Corp-corp/1099/Self-Employed");
    }else if (text=="hiring_manager")
    {
        $('#company_type').text("Hiring mananger/implementation partner/Client ")
    }else
    {
        $('#company_type').text("");
    }
}
// runAllForms();
$(function() {
    // Validation
    $("#login-form").validate({
        // Rules for form validation
        rules : {
            email : {
                required : true,
                email : true
            },
            password : {
                required : true,
                minlength : 3,
                maxlength : 20
            }
        },

        // Messages for form validation
        messages : {
            email : {
                required : 'Please enter your email address',
                email : 'Please enter a VALID email address'
            },
            password : {
                required : 'Please enter your password'
            }
        },

        // Do not change code below
        errorPlacement : function(error, element) {
            error.insertAfter(element.parent());
        }
    });
    $('#password-reset').validate();
});

