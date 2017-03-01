class UserMailer < ApplicationMailer
  default from: "no-reply@etyme.com"

  def exception_notify(name,exception,params)
    @params = params
    @name = name
    @exception = exception
    mail(:to => UserMailer.exception_admins, :subject => "Etyme - Exception")
  end

  def confirmation_instructions(user, token, opts = {})
    @owner = user
    @company = user.company
    @email =  "Etyme <no-reply@etyme.com>"
    @link  = @company.present? ? "#{@company.etyme_url}/confirmation?confirmation_token=#{token}" : " #{etyme_url}/confirmation?confirmation_token=#{token}"
    mail(:to => @owner.email, :subject => "Welcome to Etyme",:from => @email)
  end

  def reset_password_instructions(user, token, opts={})
    @user           = user
    @email          = "Etyme <no-reply@etyme.com>"
    @link           = @user.class.name!='Candidate' ? "http://#{@user.company.etyme_url}/users/password/edit?reset_password_token=#{token}" : " http://#{@user.etyme_url}/candidates/password/edit?reset_password_token=#{token}"
    mail(:to => user.email,  :subject => 'Reset password instructions',:from => @email)
  end

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
    @owner     = company.owner.present? ? company.owner : company.company_contact
    @name      = @owner.full_name
    mail(to: @owner.email,  subject: "#{@company.name.titleize} welcome to Etyme",from: "Etyme <no-reply@etyme.com>")
  end
  private

  def self.exception_admins
    ['razee.khan@engin.tech', 'ahsan.ulhaq@engintechnologies.com', 'umair.azhar@engintechnologies.com','faizan.ahmad@engintechnologies.com']
  end



end
