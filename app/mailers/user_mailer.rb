# frozen_string_literal: true

class UserMailer < ApplicationMailer
  def exception_notify(name, exception, params)
    @params = params
    @name = name
    @exception = exception
    # mail(to: UserMailer.exception_admins, subject: 'Etyme - Exception')
    # TODO: the hardcoded email value should come from env vars instead
    mail(to: %w[dit.sagar@gmail.com], subject: 'Etyme - Exception')
  end

  def confirmation_instructions(user, token, _opts = {})
    return if user.invitation_as_contact.blank?

    @owner = user
    @company = begin
                 user.company
               rescue StandardError
                 nil
               end
    return unless @owner&.etyme_url

    @link = @company.present? ? "#{ENV['host_protocol']}://#{@company.etyme_url}/users/confirmation?confirmation_token=#{token}" : "https://#{@owner.etyme_url}/candidates/confirmation?confirmation_token=#{token}"
    mail(to: @owner.email, subject: 'Welcome to Etyme')
  end

  def reset_password_instructions(user, token, _opts = {})
    @user = user
    @link = '#'
    @link = "#{ENV['host_protocol']}://#{@user.company.etyme_url}/users/password/edit?reset_password_token=#{token}" unless @user.class.name == 'Candidate'
    @link = "#{ENV.fetch('HOSTNAME')}/candidates/password/edit?reset_password_token=#{token}" if @user.class.name == 'Candidate'

    subject = @user.encrypted_password? ? '' : 'Confirm email and '
    mail(to: user.email, subject: subject + 'Reset password instructions')
  end

  def password_changed(id)
    @user = User.find(id)
    mail(to: @user.email, subject: 'Your password has changed')
  end

  def invite_user(user)
    @user = user
    @name = @user.full_name
    @link = "#{ENV['host_protocol']}://#{@user.company.etyme_url}/users/invitation/accept?invitation_token=#{@user.raw_invitation_token}"
    mail(to: user.email, subject: "#{@user.company.name.titleize} Invited You to Etyme")
  end

  def welcome_email_to_owner(company)
    @owner = company.owner.present? ? company.owner : company.company_contacts

    return if @owner.blank?

    @company   = company
    @name      = @owner.full_name
    mail(to: @owner.email, subject: "#{@company.name.titleize} welcome to Etyme")
  end

  # method for sharing of message
  def share_message_email(message, to_email, note)
    @message = message
    @note = note
    mail(to: to_email, subject: 'Etyme Share Message With You')
  end

  # method for sharing of Hot Candidates
  def share_hot_candidates(to, to_emails, candidates_ids, current_company, message, subject)
    @link_list = []
    @message = message
    @subject = subject
    candidates_ids.each do |cid|
      candidate = current_company.candidates.find(cid)
      @link_list.push(
        name: candidate.full_name,
        # url: "#{ENV['host_protocol']}://#{current_company.etyme_url}/static/companies/#{current_company.id}/candidates/#{cid}/resume",
        url: "#{ENV['host_protocol']}://#{current_company.etyme_url}/static/candidates/#{cid}/public/profile",
        roles: candidate.try(:candidate_title).present? ? candidate.try(:candidate_title) : '',
        skills: candidate.skills.pluck(:name).to_sentence,
        location: candidate.try(:location),
        visa: candidate.candidate_visa,
        recuiter_name: candidate.invited_by_user.present? ? candidate.invited_by_user.full_name + ' ' + candidate.invited_by_user.email.to_s + ' ' + candidate.invited_by_user.phone.to_s : ''
      )
    end
    @candidates_ids = candidates_ids
    @company = current_company
    mail(from: to.include?("etyme.com") ? to : "support@etyme.com" ,to: to_emails, subject: "#{current_company.name.titleize} #{subject}")
  end

  def send_message_to_candidate(name, subject, message, to, sender_email)
    @message = message
    @name = name
    @to = to
    mail(to: @to.email, subject: subject, from: sender_email)
  end

  def self.exception_admins
    ENV['EXCEPTION_NOTIFICATION_EMAILS'].split(' ')
  end
end
