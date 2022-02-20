# frozen_string_literal: true

class Company::BenchJobsController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path
  before_action :fetch_job_invitation, only: %i[edit_job_invitation update_job_invitation update_bench_job]

  def index
    add_breadcrumb 'My Bench'
    @candidates = CandidatesCompany.where(company_id: current_company.id).hot_candidate.uniq(&:candidate_id)
  end

  def edit_job_invitation
  end

  def update_bench_job
    respond_to do |format|
      if @job_invitation.present?
        if @job_invitation.update(job_invitation_params.merge(sender_id: params[:job_invitation][:sender_id]))
          @candidate = @job_invitation.recipient
          @candidate.update(candidate_title: params[:job_invitation][:candidate_title], 
            location: params[:job_invitation][:location],
            candidate_visa: params[:job_invitation][:candidate_visa],
            skill_list: params[:job_invitation][:skill_list],
            recruiter_id: params[:job_invitation][:sender_id]
            )
          format.html { redirect_to company_bench_jobs_path, success: 'Bench job is successfully updated.' }
        else
          format.html { redirect_to company_bench_jobs_path, alert: 'Something went wrong' }
        end
      else
        candidate = Candidate.find(params[:candidate_id])
        current_company.sent_job_invitations.bench.create(job_invitation_params.merge(recipient: candidate, sender_id: params[:job_invitation][:sender_id], company_id: params[:company_id], invitation_type: :candidate, expiry: Date.today + 1.year))
        format.html { redirect_to company_bench_jobs_path, alert: 'Bench job is successfully updated.' }
      end
    end
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
