# frozen_string_literal: true

class Company::BenchJobsController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path
  before_action :fetch_job_invitation, only: %i[edit_job_invitation update_job_invitation]

  def index
    add_breadcrumb 'My Bench'

    @candidates = CandidatesCompany.hot_candidate.where(company_id: current_company.id)
  end

  def edit_job_invitation
  end

  def update_job_invitation
    respond_to do |format|
      if @job_invitation.present?
        if @job_invitation.update(job_invitation_params)
          format.html { redirect_to company_bench_jobs_path, success: 'Bench job is successfully updated.' }
        else
          format.html { redirect_to company_bench_jobs_path, alert: 'Something went wrong' }
        end
      else
        format.html { redirect_to company_bench_jobs_path, alert: 'Something went wrong' }
      end
    end
  end

  private

  def fetch_job_invitation
    @job_invitation = JobInvitation.find_by(recipient_id: params[:candidate_id], company_id: params[:company_id]) || JobInvitation.find_by(recipient_id: job_invitation_params[:recipient_id], company_id: params[:company_id])
  end

  def job_invitation_params
    params.require(:job_invitation).permit(:job_id, :email, :message, :invitation_purpose, :response_message, :recipient_id, :status, :expiry, :recipient_type, :invitation_type, :min_hourly_rate, :max_hourly_rate)
  end

end
