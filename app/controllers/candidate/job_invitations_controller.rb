class Candidate::JobInvitationsController < ApplicationController
  before_action :set_job_invitations

  def index

  end

  private
  def set_job_invitations
    current_candidate.job_invitations.all
  end
end
