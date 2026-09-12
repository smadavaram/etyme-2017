# frozen_string_literal: true

class Company::JobInvitationsController < Company::BaseController
  before_action :find_job, only: %i[create update create_multiple import]
  before_action :find_job_invitation, only: [:update]
  before_action :set_job_invitations, only: [:index]
  before_action :find_received_job_invitations, only: [:reject]
  before_action :authorize_user, only: %i[accept reject]
  before_action :authorize_send_user, only: %i[create create_multiple]
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'JOB INVITATIONS', job_invitations_path, options: { title: 'JOBS INVITATIONS' }
  end

  def accept_bench
    @job_invitation = JobInvitation.find params[:job_invitation_id]
    if @job_invitation.update(status: :accepted)
      @job_invitation.company.candidates_companies.where(candidate_id: @job_invitation.recipient_id).update_all(status: :hot_candidate)
      @job_invitation.sender.update(associated_company: @job_invitation.company)

      flash[:success] = 'Updates Successfully'
    else
      flash[:errors] = @job_invitation.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def reject_bench
    @job_invitation = JobInvitation.find params[:job_invitation_id]

    if @job_invitation.update(status: :rejected)
      flash[:success] = 'Updates Successfully'
    else
      flash[:errors] = @job_invitation.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def bench_candidate_invitation
    if current_company.job_invitations_sender.where.not(status: 'rejected').where(recipient_id: params[:job_invitation][:recipient_id]).blank?
      @job_invitation = current_company.sent_job_invitations.new(job_invitation_params.merge!(created_by_id: current_user.id, sender_id: current_company.id, sender_type: 'Company'))
      if @job_invitation.save
        CandidatesCompany.where(candidate: @job_invitation.recipient, company: current_company).update_all(status: :hot_candidate)
        flash[:success] = 'Candidate is added to Bench and invitation is also sent'
      else
        flash[:errors] = @job_invitation.errors.full_messages
      end
    else
      flash[:errors] = 'Invitation has been sent already'
    end
    redirect_back(fallback_location: company_bench_jobs_path)
  end

  def create
    min_hourly_rate = job_invitation_params["min_hourly_rate"].present? ? job_invitation_params["min_hourly_rate"] : 0 
    max_hourly_rate = job_invitation_params["max_hourly_rate"].present? ? job_invitation_params["max_hourly_rate"] : 0 
    @job_invitation = current_company.sent_job_invitations.new(job_invitation_params.merge!(job_id: @job.id, created_by_id: current_user.id,min_hourly_rate: min_hourly_rate ,max_hourly_rate: max_hourly_rate))
    respond_to do |format|
      if @job_invitation.save 
        format.js { flash.now[:success] = 'Job Invitation successfully send.' }
      else
        format.js { flash.now[:errors] = @job_invitation.errors.full_messages }
      end
    end
  end

  def show
    @job_invitation = current_company.find_sent_or_received_invitation(params[:id]).first
    @company_job = @job_invitation.job
  end

  def update
    respond_to do |format|
      if @job_invitation.update(job_invitation_params)
        format.html { redirect_to @job_invitation, notice: "Successfully #{@job_invitation.status}." }
        format.js { flash.now[:success] = "Job Invitation successfully #{@job_invitation.status}." }
      else
        format.js { flash.now[:errors] = @job_invitation.errors.full_messages }
      end
    end
  end

  # def accept
  #   @job_application = @job_invitation.build_job_application
  #   @job_application.custom_fields.build
  #   # render layout: 'company'
  # end
  #
  def reject
    respond_to do |format|
      if @job_invitation.rejected!
        format.html { redirect_to @job_invitation, notice: "Successfully #{@job_invitation.status}." }
        format.js { flash.now[:success] = "Job Invitation successfully #{@job_invitation.status}." }
      else
        format.js { flash.now[:errors] = @job_invitation.errors.full_messages }
      end
    end
  end

  def authorize_user
    has_access?('manage_job_invitations')
  end

  def authorize_send_user
    has_access?('send_job_invitations')
  end

  def create_multiple
    invitation_params = job_invitation_params
    invitation_params['min_hourly_rate'] = 0 unless invitation_params['min_hourly_rate'].present?
    invitation_params['max_hourly_rate'] = 0 unless invitation_params['max_hourly_rate'].present?

    if params.key?('vendor_company') || params.key?('vendor_groups')
      SendJobInvitationsJob.perform_later(params[:vendor_company], invitation_params.merge!(created_by_id: current_user.id, invitation_type: 'vendor', recipient_type: 'User'),
                                          current_company, params[:vendor_groups])
      flash[:success] = 'Sending Job invitations to selected vendors.'
    elsif @params.key?('temp_groups') || @params.key?('temp_candidates')
      SendJobInvitationsJob.perform_later(params[:temp_candidates], invitation_params.merge!(created_by_id: @current_user.id, invitation_type: 'candidate', recipient_type: 'Candidate'),
                                          current_company, params[:temp_groups])
      flash[:success] = 'Sending Job invitations to selected candidates.'
    else
      flash[:notice] = 'Please select atleast one vendor or candidate!'
    end
    redirect_back fallback_location: root_path
  end

  def import
    Consultant.import(params[:consultant][:file], current_company, current_user)
    redirect_back fallback_location: root_path, notice: 'Bulk imported.'
  end

  private

  def set_job_invitations
    @rec_search = current_company.received_job_invitations.job.order(created_at: :desc).includes(:created_by, :recipient, job: %i[created_by company]).search(params[:q])
    @received_job_invitations = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
    @sent_search = current_company.sent_job_invitations.job.order(created_at: :desc).includes(:created_by, :recipient, job: %i[created_by company]).search(params[:q])
    @sent_job_invitations = @sent_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end

  def find_job
    @job = current_company.jobs.find_by_id(params[:job_id]) || []
  end

  def find_job_invitation
    @job_invitation = @job.job_invitations.find_by_id(params[:id]) || []
  end

  def find_received_job_invitations
    @job_invitation = current_company.received_job_invitations.where(id: params[:id]).first
  end

  def job_invitation_params
    params.require(:job_invitation).permit(:job_id, :email, :first_name, :last_name, :message, :invitation_purpose, :response_message, :recipient_id, :email, :status, :expiry, :recipient_type, :invitation_type, :min_hourly_rate, :max_hourly_rate)
  end
end
