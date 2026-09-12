# frozen_string_literal: true

class JobApplicationWorkflowService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def create_multiple_for_candidate(job, candidate_ids, job_application_params)
    messages = []
    Candidate.where(id: candidate_ids).each do |c|
      begin
        if job.status == 'Bench'
          resume = c.candidates_resumes.find_by(id: job_application_params[:applicant_resume])
          resume = c.candidates_resumes.create(resume: job_application_params[:applicant_resume]) unless resume
          c.job_applications.create!(job_application_params.merge(cover_letter: 'Application created by owner', applicant_resume: resume.resume, job_id: job.id, applied_by: @current_user))
        else
          c.job_applications.create!(applicant_resume: c.resume, cover_letter: 'Application created by owner', job_id: job.id, applied_by: @current_user)
        end
      rescue ActiveRecord::RecordInvalid => e
        messages << "#{c.first_name} is already an applicant"
      end
    end
    { success: messages.empty?, errors: messages }
  end

  def submit_to_client(job_application)
    if job_application.job.parent_job_id
      new_application = job_application.dup
      new_application.job_id = job_application.job.parent_job_id
      new_application.company = @company
      if new_application.save
        job_application.client_submission!
        record_activity(job_application)
        { success: true, message: 'Application Is submitted to the client' }
      else
        { success: false, errors: new_application.errors.full_messages }
      end
    else
      source = job_application.job.source.to_s.strip
      if /\A[\w+\-.]+@[a-z\d\-]+(\.[a-z]+)*\.[a-z]+\z/i.match?(source)
        if JobApplicationMailer.submit_to_client(job_application.id, job_application.job.id, @company).deliver
          job_application.client_submission!
          { success: true, message: 'Application is Mailed to the client' }
        else
          { success: false, errors: ['Something went wrong'] }
        end
      else
        { success: false, errors: ['No valid client email found'] }
      end
    end
  end

  def schedule_interview(job_application, interview_params, job_url)
    interview = if interview_params[:id].present?
                  job_application.interviews.find_by(id: interview_params[:id])
                else
                  job_application.interviews.new(interview_params.except(:id).merge(accepted_by_company: true))
                end

    save_result = interview.new_record? ? interview.save : interview.update(interview_params.except(:id).merge(accept: false, accepted_by_recruiter: false, accepted_by_company: true))

    if save_result
      conversation = job_application.conversation
      conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation)
      body = "#{@current_user.full_name} has schedule an interview on #{interview.date} at #{interview.date} <a href='#{job_url}'> with reference to the job </a>#{job_application.job.title}."
      @current_user.conversation_messages.create(conversation_id: conversation.id, body: body, message_type: :schedule_interview, resource_id: interview.id)
      { success: true, message: 'Interview is Scheduled, pending confirmation' }
    else
      { success: false, errors: job_application.errors.full_messages }
    end
  end

  def accept_interview(job_application, interview_id, job_url)
    interview = job_application.interviews.find_by(id: interview_id)
    is_owner = @current_user == job_application.job.company.owner

    if is_owner && interview.accepted_by_company
      return { success: false, errors: ['Already Accepted by you'] }
    elsif !is_owner && interview.accepted_by_recruiter
      return { success: false, errors: ['Already Accepted by you'] }
    end

    update_result = is_owner ? interview.update(accepted_by_company: true) : interview.update(accepted_by_recruiter: true)

    if update_result
      conversation = job_application.conversation
      if interview.is_accepted?
        conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation)
        job_application.interviewing!
        record_activity(job_application)
      end
      body = "#{@current_user.full_name} has accepted the interview on #{interview.date} at #{interview.date} <a href='#{job_url}'> with reference to the job </a>#{job_application.job.title}."
      @current_user.conversation_messages.create(conversation_id: conversation.id, body: body, resource_id: interview.id)
      { success: true, message: 'Interview Schedule is accepted' }
    else
      { success: false, errors: interview.errors.full_messages }
    end
  end

  def accept_rate(job_application)
    is_owner = job_application.job.company.owner == @current_user
    update_attrs = is_owner ? { accept_rate_by_company: true, status: :rate_confirmation } : { accept_rate: true, status: :rate_confirmation }

    if job_application.update(update_attrs)
      conversation = job_application.conversation
      if job_application.is_rate_accepted?
        conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation)
        record_activity(job_application)
      end
      body = "#{@current_user.full_name} has accepted #{job_application.rate_per_hour}/hr with reference to #{job_application.job.title} job."
      @current_user.conversation_messages.create(conversation_id: conversation.id, body: body, message_type: :job_conversation)
      { success: true, message: 'Rate is Confirmed' }
    else
      { success: false, errors: job_application.errors.full_messages }
    end
  end

  def negotiate_rate(job_application, rate_params)
    if job_application.update(rate_params.merge(rate_initiator: @current_user.full_name, accept_rate: false, accept_rate_by_company: false))
      conversation = job_application.conversation
      conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation)
      body = "#{@current_user.full_name} has offered you #{job_application.rate_per_hour}/hr with reference to #{job_application.job.title} job."
      @current_user.conversation_messages.create(conversation_id: conversation.id, body: body, message_type: :rate_confirmation)
      { success: true, message: 'Rate is set for candidate confirmation' }
    else
      { success: false, errors: job_application.errors.full_messages }
    end
  end

  def share_with_companies(job_application, vendor_company_ids)
    Company.where(id: vendor_company_ids).each do |c|
      recipient = c.invited_by.present? ? c.company_contacts.first : c.owner
      next unless recipient.present?

      share_url = "http://#{@company.etyme_url}/job_applications/#{job_application.share_key}/share"
      recipient.notifications.create(
        message: "#{@company.name} share a <a href='#{share_url}' target='_blank'>job application - #{job_application.job.title}</a> with you.",
        title: 'Job Application'
      )
    end
    { success: true, message: "job application - #{job_application.job.title} Successfully Shared." }
  end

  def find_or_create_conversation(job_application, user)
    ConversationMessage.unread_messages(user, @current_user).update_all(is_read: true)
    conversation = Conversation.where(topic: :JobApplication, job_application_id: job_application.id).first
    unless conversation.present?
      name = [user.full_name, @current_user.full_name]
      group = nil
      Group.transaction do
        group = @company.groups.create(group_name: name.join(', '), member_type: 'Chat')
        group.groupables.create(groupable: user)
        group.groupables.create(groupable: @current_user)
        group.groupables.create(groupable: job_application.recruiter_company) if job_application.recruiter_company
      end
      conversation = Conversation.create(chatable: group, topic: :JobApplication, job_application_id: job_application.id) if group.present?
    end
    conversation
  end

  def send_docusign_templates(job_application, document_ids, signer_ids)
    plugin = @company.plugins.docusign.first
    documents = @company.company_candidate_docs.where(id: document_ids)
    results = []

    documents.each do |sign_doc|
      document_sign = @company.document_signs.create(
        requested_by: @current_user,
        documentable: sign_doc,
        signable: job_application.applicationable,
        is_sign_done: false,
        part_of: job_application,
        signers_ids: signer_ids.to_s.tr('[', '{').tr(']', '}')
      )
      if document_sign.is_signable?
        result = request_sign(document_sign, plugin)
        results << result
      else
        results << { success: true, message: 'Your request is submitted for processing' }
      end
    end
    results
  end

  private

  def request_sign(document_sign, plugin)
    response = (Time.current - plugin.updated_at).to_i.abs / 3600 <= 2 ? true : RefreshToken.new(plugin).refresh_docusign_token
    if response.present?
      result = DocusignEnvelope.new(document_sign, plugin).create_envelope
      if !result.is_a?(Hash) && (result.status == 'sent')
        document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
        { success: true, message: 'Document is submitted to the candidate for signature' }
      else
        document_sign.destroy
        error = eval(result[:error_message])
        { success: false, errors: ["#{error[:errorCode]}: #{error[:message]}"] }
      end
    else
      { success: false, errors: ['Docusign token request failed, please regenerate the token from integrations'] }
    end
  end

  def record_activity(job_application)
    job_application.create_activity key: 'job_application.status', owner: @current_user, recipient: job_application, additional_data: { status: job_application.status.camelcase }
  end
end
