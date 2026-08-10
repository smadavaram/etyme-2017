# frozen_string_literal: true

class CandidateManagementService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def get_or_create_bench_candidate(candidate_params, add_to_bench: false)
    candidate = Candidate.find_by(email: candidate_params[:email])

    if candidate.nil?
      candidate = @company.candidates.new(
        candidate_params.merge(
          send_welcome_email_to_candidate: false,
          invited_by_id: @current_user.id,
          invited_by_type: 'User',
          status: 'campany_candidate'
        )
      )

      if candidate.save
        @company.candidates << candidate
        candidate.create_activity :create, owner: @company, recipient: @company
        CandidatesResume.create(candidate_id: candidate.id, resume: candidate.resume, is_primary: true)
        Address.create(address_1: candidate.location, addressable_type: 'Candidate', addressable_id: candidate.id)
        @company.candidates_companies.where(candidate: candidate).first.hot_candidate! if add_to_bench
        { success: true, candidate: candidate, message: 'New Candidate Is Added' }
      else
        { success: false, errors: candidate.errors.full_messages }
      end
    else
      { success: true, candidate: candidate, existing: true }
    end
  end

  def create_candidate(candidate_params, add_to_bench: false)
    existing = Candidate.find_by(email: candidate_params[:email])

    if existing.present?
      candidates_company = CandidatesCompany.new(candidate_id: existing.id, company_id: @company.id, candidate_status: 'pending')
      if candidates_company.save
        { success: true, candidate: existing, message: 'Candidate added to the company!' }
      else
        { success: false, errors: candidates_company.errors.full_messages }
      end
    else
      candidate = @company.candidates.new(
        candidate_params.merge(
          send_welcome_email_to_candidate: false,
          invited_by_id: @current_user.id,
          invited_by_type: 'User',
          status: 'campany_candidate'
        )
      )

      if candidate.save
        @company.candidates << candidate
        candidate.create_activity :create, owner: @company, recipient: @company
        CandidatesResume.create(candidate_id: candidate.id, resume: candidate.resume, is_primary: true)
        Address.create(address_1: candidate.location, addressable_type: 'Candidate', addressable_id: candidate.id)
        @company.candidates_companies.where(candidate: candidate).first.hot_candidate! if add_to_bench
        { success: true, candidate: candidate, message: 'New Candidate Is Added' }
      else
        { success: false, errors: candidate.errors.full_messages }
      end
    end
  end

  def make_hot(candidate_id)
    candidate = Candidate.find_by_id(candidate_id)
    company_candidate = CandidatesCompany.normal.where(candidate_id: candidate.id, company_id: @company.id)

    if company_candidate.update_all(status: 1)
      @company.sent_job_invitations.bench.create(
        recipient: candidate,
        created_by: @current_user,
        invitation_type: :candidate,
        expiry: Date.today + 1.year,
        min_hourly_rate: 20,
        max_hourly_rate: 30
      )
      { success: true, message: 'Candidate is now Hot Candidate.' }
    else
      { success: false, errors: company_candidate.errors.full_messages }
    end
  end

  def make_normal(candidate_id)
    candidate = Candidate.find_by_id(candidate_id)
    company_candidate = CandidatesCompany.hot_candidate.where(candidate_id: candidate_id, company_id: @company.id)

    if company_candidate.update_all(status: 0)
      JobInvitation.where(recipient_id: candidate_id, company_id: @company.id).destroy_all
      candidate.update(associated_company: Company.get_freelancer_company)
      { success: true, message: 'Candidate is now Normal Candidate.' }
    else
      { success: false, errors: company_candidate.errors.full_messages }
    end
  end

  def generate_link_preview(candidate_ids, title, rendered_html)
    url = "#{candidate_ids.join(',')}"
    uploader = FileUploadService.new
    kit = IMGKit.new(rendered_html, width: 1200, height: 630, quality: 80)
    img = kit.to_img(:png)

    upload_result = uploader.upload_to_s3(img, 'link_image.png')
    return { success: false, error: 'Upload failed' } unless upload_result[:success]

    preview_url = upload_result[:url]
    { success: true, preview_url: preview_url }
  end

  def share_candidates(candidate_ids, emails, emails_bcc, message, subject)
    c_ids = candidate_ids.split(',').map(&:to_i)
    all_emails = []

    emails.each do |e|
      company = User.where(email: e).first
      if company.present?
        c_ids.each do |id|
          @company.active_relationships.create(candidate_id: id, shared_to_id: company.company_id)
        end
      end
      email = e.include?('[') ? JSON.parse(e) : e
      all_emails << email
    end

    if emails_bcc.present?
      emails_bcc.each do |e|
        company = User.where(email: e).first
        if company.present?
          c_ids.each do |id|
            @company.active_relationships.create(candidate_id: id, shared_to_id: company.company_id)
          end
        end
        email = e.include?('[') ? JSON.parse(e) : e
        all_emails << email
      end
    end

    User.share_candidates(@current_user.email, all_emails.flatten.uniq.split(','), c_ids, @company, message, subject)
    { success: true, message: 'Candidates shared successfully.' }
  end
end
