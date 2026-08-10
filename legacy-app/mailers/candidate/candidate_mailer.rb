# frozen_string_literal: true

class Candidate::CandidateMailer < ApplicationMailer
  def welcome_candidate(candidate)
    @candidate = candidate
    mail(to: @candidate.email, subject: "Welcome To Etyme")
  end

  def invite_user(candidate, user)
    @candidate    = candidate
    @name         = candidate.full_name
    @sender       = user
    @link         = "#{ENV['host_protocol']}://#{@candidate.etyme_url}/candidates/invitation/accept?invitation_token=#{@candidate.raw_invitation_token}"
    mail(to: candidate.email, subject: "#{@sender.full_name.titleize} Invited You to Etyme")
  end

  def client_reference(email, candidate_name, id, slug)
    @candidate = candidate_name
    @id = id
    @slug = slug
    mail(to: email, subject: 'Reference Etyme')
  end
end
