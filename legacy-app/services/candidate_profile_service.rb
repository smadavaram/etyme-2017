# frozen_string_literal: true

class CandidateProfileService
  def initialize(candidate)
    @candidate = candidate
  end

  def move_to_employer(client_id)
    client = @candidate.clients.find_by(id: client_id)
    designation = @candidate.designations.new(
      start_date: client.start_date,
      end_date: client.end_date,
      comp_name: client.name,
      company_role: client.role
    )

    if designation.save
      client.destroy
      @candidate.update(ever_worked_with_company: 'No') if @candidate.clients.count == 0
      { success: true, message: 'Successfully transfer Client to employer' }
    else
      { success: false, errors: designation.errors.full_messages }
    end
  end

  def build_profile(resume_id)
    resume = @candidate.candidates_resumes.find_by(id: resume_id)
    response = ResumeParser.new(resume.resume).sovren_parse
    begin
      if response.code == '200'
        parsed_hash = JSON.parse(JSON.parse(response.body)['Value']['ParsedDocument'])['Resume']
        @candidate.sovren_build_profile(parsed_hash)
        { success: true, message: 'Profile build request from resume is processed' }
      else
        { success: false, errors: [response.body] }
      end
    rescue StandardError => e
      { success: false, errors: [e.message] }
    end
  end

  def upload_resume(resume_file)
    new_resume = @candidate.candidates_resumes.new
    new_resume.resume = resume_file
    new_resume.candidate_id = @candidate.id
    new_resume.is_primary = @candidate.candidates_resumes.empty?
    if new_resume.save
      { success: true, message: 'Resume uploaded successfully.' }
    else
      { success: false, errors: ['Resume not updated'] }
    end
  end

  def delete_resume(resume_id)
    return { success: false, errors: ['No resume specified'] } unless resume_id.present?

    resume = CandidatesResume.find_by(id: resume_id)
    if resume.is_primary
      resumes = CandidatesResume.where(candidate_id: resume.candidate_id).map(&:id)
      resumes.delete(resume.id)
      resume.destroy
      unless resumes.empty?
        primary_resume = CandidatesResume.find_by(id: resumes[0])
        primary_resume.update_attributes(is_primary: true)
      end
      message = !resumes.empty? ? 'Selected Resume has been destroy and First Resume status mark as primary' : 'Resume Destroy Successfully'
    else
      resume.destroy
      message = 'Resume Destroy Successfully'
    end
    { success: true, message: message }
  end

  def make_primary_resume(resume_id)
    return { success: false } unless resume_id.present?

    resume = CandidatesResume.find_by(id: resume_id)
    resumes = CandidatesResume.where(candidate_id: resume.candidate_id)
    resumes.update_all(is_primary: false)
    resume.update_attributes(is_primary: true)
    { success: true }
  end
end
