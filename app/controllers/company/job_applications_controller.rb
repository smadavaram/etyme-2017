# frozen_string_literal: true

class Company::JobApplicationsController < Company::BaseController
  # CallBacks
  before_action :find_job, only: %i[create create_multiple_for_candidate job_applicant_reqs_preview]
  before_action :find_received_job_invitation, only: [:create]
  before_action :set_job_applications, only: [:index]
  before_action :find_attachments, :find_signers, only: [:send_templates]
  before_action :find_received_job_application, only: %i[send_templates templates prescreen client_submission rate_negotiation accept_rate accept_interview accept reject interview hire short_list show proposal share_application_with_companies open_inbox_conversation]
  before_action :authorized_user, only: %i[accept reject interview hire short_list show]
  skip_before_action :authenticate_user!, :authorized_user, only: [:share], raise: false
  add_breadcrumb 'Dashboard', :dashboard_path

  def applicant
    @job_application = current_company.received_job_applications.find_by(id: params[:id])
    @candidate = @job_application.applicationable
    @conversation = @job_application.conversation
  end

  def index
    add_breadcrumb (@status=='Bench' ? 'Bench ' : '') + 'JOB APPLICATIONS', job_applications_path, options: { title: 'JOBS APPLICATION' }

    respond_to do |format|
      format.html {}
      format.json { render json: JobApplicationDatatable.new(params, view_context: view_context) }
    end
  end

  def create
    @job_application = current_company.sent_job_applications.new(job_application_params.merge!(applicationable_id: current_user.id, job_id: @job.id, job_invitation_id: @job_invitation.id, applicationable_type: 'User', recruiter_company_id: 3))
    respond_to do |format|
      if @job_application.save
        format.js { flash.now[:success] = "Successfully Created." }
      else
        format.js { flash.now[:errors] = @job_application.errors.full_messages }
      end
    end
  end

  def create_multiple_for_candidate
    if request.post?
      service = JobApplicationWorkflowService.new(current_user, current_company)
      result = service.create_multiple_for_candidate(@job, params[:temp_candidates], job_application_params)
      flash[:error] = result[:errors] if result[:errors].any?
      @post = true
      redirect_back(fallback_location: root_path)
    end

    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name)
    end
  end

  def job_applicant_reqs_preview
    @job_application = JobApplication.find(params[:id])
    @job_applicant_reqs = @job_application.job_applicant_reqs
  end

  def accept
    respond_to do |format|
      if @job_application.hired?
        @contract = @job_application.job.contracts.new
        @contract.contract_terms.new
        format.js
      else
        format.js { flash.now[:errors] = ['Request Not Completed.'] }
      end
    end
  end

  def templates
    @document_signs = current_company.document_signs.where(signable: @job_application.applicationable, part_of: @job_application)
  end

  def delete_templates
    DocumentSign.find(params[:docu_id]).delete
    respond_to do |format|
      format.js { flash.now[:success] = 'Document deleted successfully!' }
    end
  end

  def request_sign
    @plugin = current_company.plugins.first
    response = (Time.current - @plugin.updated_at).to_i.abs / 3600 <= 2 ? true : RefreshToken.new(@plugin).refresh_docusign_token
    if response.present?
      result = DocusignEnvelope.new(@document_sign, @plugin).create_envelope
      if !result.is_a?(Hash) && (result.status == 'sent')
        @document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
        flash[:success] = 'Document is submitted to the candidate for signature'
      else
        @document_sign.destroy
        error = eval(result[:error_message])
        flash[:errors] = ["#{error[:errorCode]}: #{error[:message]}"]
      end
    else
      flash[:errors] = ['Docusign token request failed, please regenerate the token from integrations']
    end
  end

  def send_templates
    service = JobApplicationWorkflowService.new(current_user, current_company)
    service.send_docusign_templates(@job_application, params[:ids], params[:signers])
    @document_signs = @job_application.applicationable.document_signs
    redirect_back(fallback_location: current_company.etyme_url)
  end

  def reject
    respond_to do |format|
      if !@job_application.hired?
        if @job_application.rejected!
          create_conversation_message
          record_activity
          format.html { flash[:success] = 'Successfully Rejected.' }
        else
          format.html { flash[:errors] = @job_application.errors.full_messages }
        end
      else
        format.html { flash[:errors] = ['Request Not Completed.'] }
      end
    end
    redirect_back fallback_location: root_path
  end

  def client_submission
    service = JobApplicationWorkflowService.new(current_user, current_company)
    result = service.submit_to_client(@job_application)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def prescreen
    if @job_application.prescreen!
      create_conversation_message
      record_activity
      flash[:success] = 'Successfully Prescreen.'
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def short_list
    if @job_application.short_listed?
      flash[:success] = 'Application is already ShortListed'
    else
      if @job_application.short_listed!
        create_conversation_message
        record_activity
        flash[:success] = 'Successfully ShortListed.'
      else
        flash[:errors] = @job_application.errors.full_messages
      end
    end
    redirect_back fallback_location: root_path
  end

  def interview
    service = JobApplicationWorkflowService.new(current_user, current_company)
    result = service.schedule_interview(@job_application, interview_params, static_job_url(@job_application.job).to_s)
    respond_to do |format|
      if result[:success]
        format.html { flash[:success] = result[:message] }
      else
        format.html { flash[:errors] = result[:errors] }
      end
    end
    redirect_back fallback_location: root_path
  end

  def accept_interview
    service = JobApplicationWorkflowService.new(current_user, current_company)
    result = service.accept_interview(@job_application, params[:interview_id], static_job_url(@job_application.job).to_s)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def hire
    respond_to do |format|
      if @job_application.hired!
        create_conversation_message
        format.html { flash[:success] = 'Successfully Hired.' }
      else
        format.html { flash[:errors] = @job_application.errors.full_messages }
      end
    end
    redirect_back fallback_location: root_path
  end

  def authorized_user
    has_access?('manage_job_applications')
  end

  def show
    add_breadcrumb 'JOB APPLICATIONS', job_applications_path, options: { title: 'JOBS APPLICATION' }
    add_breadcrumb "JOB APPLICATIONS ID: #{params[:id]}"

    set_conversation(@job_application.applicationable)
    @reminder = Reminder.where(reminderable_id:@job_application.id).last
    @activities = PublicActivity::Activity.where(recipient: @job_application).order("created_at desc")
    @previous = JobApplication.where("id < ?", @job_application.id).sort.last
    @next = JobApplication.where("id > ?", @job_application.id).sort.first
  end

  def open_inbox_conversation
    set_conversation(@job_application.applicationable)
    redirect_to(company_conversations_path(conversation: @conversation.id))
  end

  def proposal
    set_conversation(@job_application.applicationable)
    @conversation_messages = @conversation.conversation_messages.last(50)
    @unread_message_count = Conversation.joins(:conversation_messages).where('(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)', current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: { is_read: true, userable: current_user }).uniq.size
    @conversation_message = ConversationMessage.new
  end

  def accept_rate
    service = JobApplicationWorkflowService.new(current_user, current_company)
    result = service.accept_rate(@job_application)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def rate_negotiation
    service = JobApplicationWorkflowService.new(current_user, current_company)
    result = service.negotiate_rate(@job_application, job_application_rate)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def share
    @job_application = JobApplication.where(share_key: params[:id]).first
    render layout: 'share'
  end

  def share_application_with_companies
    if params.key?('vendor_company')
      service = JobApplicationWorkflowService.new(current_user, current_company)
      service.share_with_companies(@job_application, params[:vendor_company])
    end
    redirect_back fallback_location: root_path, notice: "job application - #{@job_application.job.title} Successfully Shared."
  end

  private

  def record_activity
    # owner: who performs the activity
    # recipient: the one on which the activity is performed
    # additional_data: hash of things about the recipients --needed to make links
    @job_application.create_activity key: 'job_application.status', owner: current_user, recipient: @job_application, additional_data: { status: @job_application.status.camelcase }
  end

  def set_conversation(user)
    service = JobApplicationWorkflowService.new(current_user, current_company)
    @conversation = service.find_or_create_conversation(@job_application, user)
  end

  def interview_params
    params.require(:interview).permit(:date, :time, :location, :source)
  end

  def set_job_applications
    @status = params[:type]=='Bench' ? 'Bench' : 'Published'
    @search = current_company.received_job_applications.joins(:job).where(jobs: { status: @status }).includes(:applicationable)
    @search = @search.search(params[:q])
    @received_job_applications = @search.result.order(created_at: :desc).paginate(page: params[:page], per_page: 20) || []
    @sent_search = current_company.sent_job_applications.order(created_at: :desc).includes(:job, :applicationable).search(params[:q])
    @sent_job_applications = @sent_search.result(distinct: true).paginate(page: params[:page], per_page: 20) || []
  end

  def find_job
    # @job = current_company.jobs.find_by_id(params[:job_id]) || []
    @job = Job.where(id: params[:job_id]).first || []
  end

  def find_job_invitation
    @job_invitation = @job.job_invitations.find_by_id(params[:job_invitation_id]) || []
  end

  def find_received_job_invitation
    @job_invitation = current_company.received_job_invitations.where(id: params[:job_invitation_id]).first || []
  end

  def find_received_job_application
    @job_application = current_company.received_job_applications.where(id: params[:id]).first || current_company.sent_job_applications.where(id: params[:id]).first || []
  end

  def job_application_params
    params.require(:job_application).permit([:message, :cover_letter, :status, :client_name, :end_client_job_title, :company_contact_id, :work_type, :client_job_location, job_applicant_reqs_attributes: [:id, :job_requirement_id, :applicant_ans, app_multi_ans: []],
      custom_fields_attributes:
        %i[
          id
          name
          value
        ]])
  end

  def create_conversation_message
    @conversation = @job_application.conversation
    body = current_user.full_name.capitalize + " has #{@job_application.status.humanize} you on your Job application against the #{@job_application.job.title} job"
    current_user.conversation_messages.create(conversation_id: @conversation.id, body: body)
  end

  def job_application_rate
    params.require(:job_application).permit(:rate_per_hour)
  end

  def find_attachments
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
  end

  def find_signers
    @signers = current_company.users.where(id: params[:signers])
  end
end
