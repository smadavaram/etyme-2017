# frozen_string_literal: true

class UserMailer < ApplicationMailer
  def exception_notify(name, exception, params)
    @params = params
    @name = name
    @exception = exception
    mail(to: UserMailer.exception_admins, subject: 'Etyme - Exception')
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

    @link = @company.present? ? "https://#{@company.etyme_url}/users/confirmation?confirmation_token=#{token}" : "https://#{@owner.etyme_url}/candidates/confirmation?confirmation_token=#{token}"
    mail(to: @owner.email, subject: 'Welcome to Etyme')
  end

  def reset_password_instructions(user, token, _opts = {})
    @user = user
    @link = @user.class.name != 'Candidate' ?
              "https://#{@user.company.etyme_url}/users/password/edit?reset_password_token=#{token}" :
              "https://#{@user.etyme_url}/candidates/password/edit?reset_password_token=#{token}"
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
    @link = "https://#{@user.company.etyme_url}/users/invitation/accept?invitation_token=#{@user.raw_invitation_token}"
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
        url: "https://#{current_company.etyme_url}/static/companies/#{current_company.id}/candidates/#{cid}/resume",
        roles: candidate.try(:roles).present? ? candidate.roles.pluck(:name).to_sentence : '',
        skills: candidate.skills.pluck(:name).to_sentence,
        location: candidate.try(:location),
        visa: candidate.candidate_visa,
        recuiter_name: candidate.invited_by_user.present? ? candidate.invited_by_user.full_name + ' ' + candidate.invited_by_user.email.to_s + ' ' + candidate.invited_by_user.phone.to_s : ''
      )
    end
    @candidates_ids = candidates_ids
    @company = current_company
    mail(to: to, bcc: to_emails, subject: "#{current_company.name.titleize} #{subject}")
  end

  def send_message_to_candidate(name, subject, message, to, sender_email)
    @message = message
    @name = name
    @to = to
    mail(to: @to.email, subject: subject, from: sender_email)
  end

  def self.exception_admins
    ['hamad@enginetech.io', 'tanays.tps@gmail.com']
  end
end
