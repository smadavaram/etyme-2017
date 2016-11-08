class UserMailer < Devise::Mailer
  default from: "no-reply@etyme.com"


  def confirmation_instructions(owner, token, opts = {})
    @owner = owner
    @company = owner.company
    @email =  "Etyme <no-reply@etyme.com>"
    @token = token
    mail(:to => @owner.email, :subject => "Welcome to Etyme",:from => @email)
  end

  def reset_password_instructions(record, token, opts={})
    @token = token
    devise_mail(record, :reset_password_instructions, opts)
  end

end
