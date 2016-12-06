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

  def invite_user(user)
    @user   = user
    @name         = @user.full_name
    @link         = "http://#{@user.company.etyme_url}/users/invitation/accept?invitation_token=#{@user.raw_invitation_token}"
    mail(to: user.email,  subject: "#{@user.company.name.titleize} Invited You to Etyme",from: "Etyme <no-reply@etyme.com>")
  end



  def welcome_email_to_owner(company)
    @company   = company
    @owner     = company.owner
    @name      = @owner.full_name
    mail(to: @owner.email,  subject: "#{@company.name.titleize} welcome to Etyme",from: "Etyme <no-reply@etyme.com>")
  end
end
