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
    @company = user.company rescue nil
    @email =  "Etyme <no-reply@etyme.com>"
    @link  = @company.present? ? "http://#{@company.etyme_url}/users/confirmation?confirmation_token=#{token}" : "http://#{@owner.etyme_url}/candidates/confirmation?confirmation_token=#{token}"
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

  # method for sharing of message
  def share_message_email(message,to_email , note)
    @message = message
    @note = note
    mail(to: to_email ,subject: "Etyme Share Message With You" ,from: "Etyme <no-reply@etyme.com>")
  end

  # method for sharing of Hot Candidates
  def share_hot_candidates(to,to_emails,candidates_ids ,current_company,message)
    @link_list = []
    @message = message
    candidates_ids.each do |cid|
      candidate = current_company.candidates.find(cid)
      @link_list.push({
                          name: candidate.full_name,
                          url: "http://#{current_company.etyme_url}/static/companies/#{current_company.id}/candidates/#{cid}/resume",
                          roles: candidate.try(:roles).present? ? candidate.roles.pluck(:name).to_sentence : '',
                          skills: candidate.skills.pluck(:name).to_sentence,
                          location: candidate.try(:location),
                          visa: candidate.visa,
                          recuiter_name: candidate.invited_by_user.present? ? candidate.invited_by_user.full_name + ' ' + candidate.invited_by_user.email.to_s + ' ' + candidate.invited_by_user.phone.to_s : ''
                      })
    end
    @candidates_ids = candidates_ids
    @company = current_company
    mail(to: to,bcc: to_emails, subject: "#{current_company.name.titleize} Shared Hot Candidates Link",from: "Etyme <no-reply@etyme.com>")
  end

  def send_message_to_candidate(name,subject,message,to ,sender_email)
    @message = message
    @name = name
    @to = to
    mail(to:@to.email ,subject: subject ,from: sender_email)
  end

  private

  def self.exception_admins
    ['razee.khan@engin.tech', 'ahsan.ulhaq@engintechnologies.com', 'chirag.premium@gmail.com', 'sharath@cloudepa.com']
  end



end
