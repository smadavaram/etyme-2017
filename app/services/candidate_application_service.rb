# frozen_string_literal: true

class CandidateApplicationService
  def initialize(candidate)
    @candidate = candidate
  end

  def accept_rate(job_application)
    if job_application.update(accept_rate: true, status: :rate_confirmation)
      conversation = job_application.conversation
      conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation) if job_application.is_rate_accepted?
      body = "#{@candidate.full_name} has accepted #{job_application.rate_per_hour}/hr with reference to #{job_application.job.title} job."
      @candidate.conversation_messages.create(conversation_id: conversation.id, body: body, message_type: :job_conversation)
      { success: true, message: 'Rate is Confirmed' }
    else
      { success: false, errors: job_application.errors.full_messages }
    end
  end

  def negotiate_rate(job_application, rate_params)
    if job_application.accept_rate
      return { success: false, errors: ['You cannot change the rate once accepted by you.'] }
    end

    if job_application.update(rate_params.merge(rate_initiator: @candidate.full_name, accept_rate: false, accept_rate_by_company: false))
      conversation = job_application.conversation
      conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation)
      body = "#{@candidate.full_name} has Countered #{job_application.rate_per_hour}/hr with reference to #{job_application.job.title} job."
      @candidate.conversation_messages.create(conversation_id: conversation.id, body: body, message_type: :rate_confirmation)
      { success: true, message: 'Rate is set for company confirmation' }
    else
      { success: false, errors: job_application.errors.full_messages }
    end
  end

  def schedule_interview(job_application, interview_params, job_url)
    interview = job_application.interviews.find_by(id: interview_params[:id])

    if interview.update(interview_params.except(:id).merge(accept: true, accepted_by_recruiter: false, accepted_by_company: false))
      conversation = job_application.conversation
      conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation)
      body = "#{@candidate.full_name} has schedule an interview on #{interview.date} at #{interview.date} <a href='#{job_url}'> with reference to the job </a>#{job_application.job.title}."
      @candidate.conversation_messages.create(conversation_id: conversation.id, body: body, message_type: :schedule_interview, resource_id: interview.id)
      { success: true, message: 'Interview details updated, pending confirmation' }
    else
      { success: false, errors: job_application.errors.full_messages }
    end
  end

  def accept_interview(job_application, interview_id, job_url)
    interview = job_application.interviews.find_by(id: interview_id)

    if interview.accept
      return { success: false, errors: ['Already Accepted by you.'] }
    end

    if interview.update(accept: true)
      job_application.interviewing! if interview.is_accepted?
      conversation = job_application.conversation
      conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation) if interview.is_accepted?
      body = "#{@candidate.full_name} has accepted the interview on #{interview.date} at #{interview.date} <a href='#{job_url}'> with reference to the job </a>#{job_application.job.title}."
      @candidate.conversation_messages.create(conversation_id: conversation.id, body: body, resource_id: interview.id)
      { success: true, message: 'Interview is accepted by candidate' }
    else
      { success: false, errors: interview.errors.full_messages }
    end
  end
end
