class UserMailer < ApplicationMailer
  default from: "no-reply@etyme.com"

  # Confirmation Email Send to HiringManager/Vendor after User create
  def confirmation_instructions(user, token, opts = {})
    @owner = user
    @company = user.company
    @email =  "Etyme <no-reply@etyme.com>"
    @link  = "#{@company.etyme_url}/confirmation?confirmation_token=#{token}"
    mail(:to => @owner.email, :subject => "Welcome to Etyme",:from => @email)
  end

  # Reset Password  Email For HiringManager/Vendor
  def reset_password_instructions(user, token, opts={})
    @user           = user
    @email          = "Etyme <no-reply@etyme.com>"
    @link           = "#{@user.company.etyme_url}/password/edit?reset_password_token=#{token}"
    mail(:to => user.email,  :subject => 'Reset password instructions',:from => @email)
  end

  #Notify HiringManager/Vendor when their passwords change
  def password_changed(id)
    @user = User.find(id)
    mail to: @user.email, subject: "Your password has changed"
  end

end
