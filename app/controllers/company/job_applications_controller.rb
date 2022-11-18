# frozen_string_literal: true

class Company::JobApplicationsController < Company::BaseController
  # CallBacks
  before_action :find_job, only: %i[create creates_multiple_for_candidate]
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
    add_breadcrumb 'JOB APPLICATIONS', job_applications_path, options: { title: 'JOBS APPLICATION' }

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
    find_job
    if request.post?
      messages = []
      Candidate.where(id: params[:temp_candidates]).each do |c|
        begin
          if @job.status == 'Bench'
            resume = c.candidates_resumes.find_by(id: params[:job_application][:applicant_resume])
            if resume.nil? and params[:job_application][:applicant_resume].include?("http")
              resume = c.candidates_resumes.create(resume: params[:job_application][:applicant_resume]) 
            else
              messages << "Invalid Resume."
              raise "Invalid Resume."
            end
            c.job_applications.create!(job_application_params.merge!(cover_letter: 'Application created by owner', applicant_resume: resume.resume, job_id: @job.id, applied_by: current_user))
          else
            c.job_applications.create!(applicant_resume: c.resume, cover_letter: 'Application created by owner', job_id: @job.id, applied_by: current_user)
          end
        rescue ActiveRecord::RecordInvalid => e
          messages << "#{c.first_name} is already an applicant"
        end
      end
      flash[:error] = messages
      @post = true
      redirect_back(fallback_location: root_path)

    end
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
    @plugin = current_company.plugins.docusign.first
    @company_candidate_docs.each do |sign_doc|
      @document_sign = current_company.document_signs.create(
        requested_by: current_user,
        documentable: sign_doc,
        signable: @job_application.applicationable,
        is_sign_done: false,
        part_of: @job_application,
        signers_ids: params[:signers].to_s.tr('[', '{').tr(']', '}')
      )
      if @document_sign.is_signable?
        request_sign
      else
        flash[:success] = 'Your request is submitted for processing'
      end
    end
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
    if @job_application.job.parent_job_id
      new_application = @job_application.dup
      new_application.job_id = @job_application.job.parent_job_id
      new_application.company = current_company
      if new_application.save
        @job_application.client_submission!
        record_activity
        flash[:success] = 'Application Is submitted to the client'
      else
        flash[:errors] = new_application.errors.full_messages
      end
      redirect_back(fallback_location: root_path)
    else
      if /\A[\w+\-.]+@[a-z\d\-]+(\.[a-z]+)*\.[a-z]+\z/i.match?(@job_application.job.source.strip)
        if JobApplicationMailer.submit_to_client(@job_application.id, @job_application.job.id, current_company).deliver
          @job_application.client_submission!
          flash[:success] = 'Application is Mailed to the client'
        else
          flash[:errors] = ['Something went wrong']
        end
      end
      redirect_back(fallback_location: root_path)
    end
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
    @interview = params[:interview][:id].present? ?
                     @job_application.interviews.find_by(id: params[:interview][:id])
                     : @job_application.interviews.new(interview_params.merge(accepted_by_company: true))
    respond_to do |format|
      if @interview.new_record? ? @interview.save : @interview.update(interview_params.merge(accept: false, accepted_by_recruiter: false, accepted_by_company: true))
        @conversation = @job_application.conversation
        @conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation)
        body = current_user.full_name + " has schedule an interview on #{@interview.date} at #{@interview.date} <a href='#{static_job_url(@job_application.job).to_s}'> with reference to the job </a>#{@job_application.job.title}."
        current_user.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :schedule_interview, resource_id: @interview.id)
        format.html { flash[:success] = 'Interview is Scheduled, pending confirmation' }
      else
        format.html { flash[:errors] = @job_application.errors.full_messages }
      end
    end
    redirect_back fallback_location: root_path
  end

  def accept_interview
    @interview = @job_application.interviews.find_by(id: params[:interview_id])
    if current_user == @job_application.job.company.owner
      flash[:errors] = ['Already Accepted by you'] if @interview.accepted_by_company
    else
      flash[:errors] = ['Already Accepted by you'] if @interview.accepted_by_recruiter
    end
    if flash[:errors].present?
      redirect_back(fallback_location: root_path)
      return
    end
    if current_user == @job_application.job.company.owner ? @interview.update(accepted_by_company: true) : @interview.update(accepted_by_recruiter: true)
      @conversation = @job_application.conversation
      if @interview.is_accepted?
        @conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation)
        @job_application.interviewing!
        record_activity
      end
      body = current_user.full_name + " has accepted the interview on #{@interview.date} at #{@interview.date} <a href='#{static_job_url(@job_application.job).to_s}}'> with reference to the job </a>#{@job_application.job.title}."
      current_user.conversation_messages.create(conversation_id: @conversation.id, body: body, resource_id: @interview_id)
      flash[:success] = 'Interview Schedule is accepted'
    else
      flash[:errors] = @interview.errors.full_messages
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
    if @job_application.job.company.owner == current_user ? @job_application.update(accept_rate_by_company: true, status: :rate_confirmation) : @job_application.update(accept_rate: true, status: :rate_confirmation)
      @conversation = @job_application.conversation
      if @job_application.is_rate_accepted?
        @conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation)
        record_activity
      end
      body = current_user.full_name + " has accepted #{@job_application.rate_per_hour}/hr with reference to #{@job_application.job.title} job."
      current_user.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :job_conversation)
      flash[:success] = 'Rate is Confirmed'
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def rate_negotiation
    base_url = @job_application.applicationable&.associated_company&.owner ? "http://#{@job_application&.applicationable&.associated_company&.etyme_url}" : HOSTNAME
    if @job_application.update(job_application_rate.merge(rate_initiator: current_user.full_name, accept_rate: false, accept_rate_by_company: false))
      @conversation = @job_application.conversation
      @conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation)
      body = current_user.full_name + " has offered you #{@job_application.rate_per_hour}/hr with reference to #{@job_application.job.title} job."
      current_user.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :rate_confirmation)
      flash[:success] = 'Rate is set for candidate confirmation'
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def share
    @job_application = JobApplication.where(share_key: params[:id]).first
    render layout: 'share'
  end

  def share_application_with_companies
    if params.key?('vendor_company')
      Company.all.where(id: params[:vendor_company]).each do |c|
        if c.invited_by.present?
          next unless c.company_contacts.first.present?

          c.company_contacts.first.notifications.create(message: current_company.name + " share a <a href='http://#{current_company.etyme_url + share_job_application_path(@job_application.share_key)}' target='_blank'>job application - #{@job_application.job.title}</a> with you.", title: 'Job Application')
        else
          c.owner.notifications.create(message: current_company.name + " share a <a href='http://#{current_company.etyme_url + share_job_application_path(@job_application.share_key)}' target='_blank'>job application - #{@job_application.job.title}</a> with you.", title: 'Job Application')

        end
      end
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
    ConversationMessage.unread_messages(user, current_user).update_all(is_read: true)
    @conversation = Conversation.where(topic: :JobApplication, job_application_id: @job_application.id).first
    unless @conversation.present?
      name = [user.full_name]
      name << current_user.full_name
      # name << user.associated_company.owner.full_name if user.associated_company.owner
      group = nil
      Group.transaction do
        group = current_company.groups.create(group_name: name.join(', '), member_type: 'Chat')
        group.groupables.create(groupable: user)
        group.groupables.create(groupable: current_user)
        # group.groupables.create(groupable: user.associated_company.owner) if user.associated_company.owner
        # group.groupables.create(groupable: @job_application.recruiter_company) if user.associated_company.owner
        group.groupables.create(groupable: @job_application.recruiter_company)  if @job_application.recruiter_company
      end
      @conversation = Conversation.create(chatable: group, topic: :JobApplication, job_application_id: @job_application.id) if group.present?
    end
  end

  def interview_params
    params.require(:interview).permit(:date, :time, :location, :source)
  end

  def set_job_applications
    @search = current_company.received_job_applications.includes(:job, :applicationable).search(params[:q])
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
    params.require(:job_application).permit([:message, :cover_letter, :status, :client_name, :end_client_job_title, :company_contact_id, :work_type, :client_job_location, custom_fields_attributes:
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
