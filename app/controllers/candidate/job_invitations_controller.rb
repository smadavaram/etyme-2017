# frozen_string_literal: true

class Candidate::JobInvitationsController < Candidate::BaseController
  before_action :set_job_invitations, only: :index
  before_action :find_job_invitation, only: %i[reject show_invitation accept_bench reject_bench remove_bench]
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path

  def index
    add_breadcrumb 'invited job(s)'
  end

  def bench_company_invitation
    if current_candidate.job_invitations_sender.where.not(status: 'rejected').where(company_id: params[:job_invitation][:company_id]).blank?

      @job_invitation = Company.find(params[:job_invitation][:company_id]).sent_job_invitations.new(job_invitation_params.merge!(recipient_id: params[:job_invitation][:company_id]))
      if @job_invitation.save
        flash[:success] = 'Invitation is  sent to Company'
      else
        flash[:errors] = @job_invitation.errors.full_messages
      end
    else
      flash[:errors] = 'Invitation has been sent already'
    end
    redirect_back(fallback_location: root_path)
  end

  def bench_invitations
    add_breadcrumb 'Invitations'
    @invitations = current_candidate.job_invitations.all.bench
  end

  def remove_bench
    @candidate = current_candidate
    if current_candidate.update(associated_company: Company.get_freelancer_company)
      flash[:success] = "Candidate's bench is removed"
      @job_invitation.company.candidates_companies.where(candidate: current_candidate).update_all(status: :normal)
    else
      flash[:errors] = @candidate.errors.full_messages
    end
    redirect_back(fallback_location: candidate_invitations_bench_path)
  end

  def accept_bench
    if @job_invitation.update(status: :accepted)
      @job_invitation.company.candidates_companies.where(candidate_id: @job_invitation.recipient_id).update_all(status: :hot_candidate)
      @job_invitation.recipient.update(associated_company: @job_invitation.company)
      flash[:success] = 'Updates Successfully'
    else
      flash[:errors] = @job_invitation.errors.full_messages
    end
    @invitations = current_candidate.job_invitations.all.bench
    render :bench_invitations
  end

  def reject_bench
    if @job_invitation.update(status: :rejected)
      @job_invitation.company.candidates_companies.where(candidate_id: @job_invitation.recipient_id).update_all(status: :normal)
      @job_invitation.recipient.update(associated_company: Company.get_freelancer_company)
      flash[:success] = 'Updates Successfully'
    else
      flash[:errors] = @job_invitation.errors.full_messages
    end
    @invitations = current_candidate.job_invitations.all.bench
    render :bench_invitations
  end

  def show_invitation
    if params[:status] == 'accept'
      @job_application = @job_invitation.build_job_application
      @job_application.job_applicant_reqs.build
      @job_application.custom_fields.build
    end
    @state = params[:status] == 'accept'
    @url = "candidate/job_invitations/partials/#{params[:status]}"
  end

  def reject
    if @job_invitation.update_attributes(job_invitation_params)
      flash[:success] = 'Updates Successfully'
    else
      flash[:errors] = @job_invitation.errors.full_messages
    end
  end

  private

  def find_job_invitation
    puts params[:job_invitation_id]
    @job_invitation = current_candidate.job_invitations.find(params[:job_invitation_id])
  end

  def set_job_invitations
    @job_invitations = current_candidate.job_invitations.all.job
  end

  def job_invitation_params
    params.require(:job_invitation).permit(:invitation_purpose, :sender_id, :sender_type, :job_id, :message, :response_message, :email, :status, :expiry, :recipient_type, :invitation_type)
  end
end
