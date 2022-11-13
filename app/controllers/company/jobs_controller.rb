# frozen_string_literal: true

class Company::JobsController < Company::BaseController
  before_action :set_company_job, only: %i[show edit update destroy send_invitation]
  # before_action :set_locations  , only: [:new , :index, :edit , :create,:show]
  before_action :set_preferred_vendors_and_groups, only: [:send_invitation]
  before_action :set_candidates, only: :send_invitation
  before_action :authorize_user, only: %i[show edit update destroy]
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb params[:type].blank? ? 'job(s)' : params[:type].to_s, jobs_path, options: { title: 'JOBS' }

    @search       = current_company.jobs.not_system_generated.includes(:created_by).order(created_at: :desc).ransack(params[:q])
    @company_jobs = @search.result.order(created_at: :desc) # .paginate(page: params[:page], per_page: params[:per_page]||=15) || []
    @company_jobs = @company_jobs.where(listing_type: params[:type] || 'Job')
    @job          = current_company.jobs.new
  end

  def show
    add_breadcrumb 'job(s)', jobs_path, options: { title: 'JOBS' }
    add_breadcrumb @job.try(:title).try(:titleize)[0..30], job_path, options: { title: 'Job Invitation' }
    @job_applications = @job.job_applications
    # @conversations = @job.conversations
    # @conversation = @conversations.first
    @job.create_job_conversation unless @job.conversation.present?
    @conversation = @job.conversation
  end

  def new
    if current_company.jobs == 5 && current_user.paid != true
      flash[:notice] == "Complete the Payment to perform this action"
      redirect_to new_charge_path
    end
    
    add_breadcrumb params[:type].blank? ? 'job' : 'job ' + params[:type], jobs_path, options: { title: 'JOBS' }
    add_breadcrumb 'NEW', new_job_path, options: { title: 'NEW JOB' }
    @job = current_company.jobs.new
    @job.start_date = Time.now.strftime("%Y-%m-%d")
    @job.end_date = "9999/12/31".to_datetime.strftime("%Y-%m-%d")
    @job.job_requirements.build
    @job.allow_multiple_applications_for_candidate = false
  end

  def edit
    add_breadcrumb 'EDIT', edit_job_path(@job), options: { title: 'NEW EDIT' }
  end

  def sites_jobs_preview
    @jobs = current_company.jobs.paginate(page: params[:page], per_page: 4)
    @jobs_group = @jobs.group_by(&:job_category)
  end

  def sites_jobs_iframe; end

  def create

    params[:job][:description] = params[:job][:description].gsub("width: 100%","width: 350px")
    @job = current_company.jobs.new(company_job_params.merge!(created_by_id: current_user.id))

    if @job.listing_type.eql?('Blog')
      @job.start_date = Time.now
      @job.end_date   = Time.now + 100.years
    end

    respond_to do |format|
      if @job.save
        # CreateGoogleIndex.new(@job, "URL_UPDATED").index_job if @job.published?
        # CreateGoogleIndex.new(@job, 'URL_UPDATED').index_job if @job.status == 'Published'
        format.html { redirect_to @job, success: 'Job was successfully created.' }
        format.js { flash.now[:success] = 'successfully Created.' }
      else
        format.html { flash[:errors] = @job.errors.full_messages; render :new }
        format.js { flash.now[:errors] = @job.errors.full_messages }
      end
    end
  end

  def update

    params[:job][:description] = params[:job][:description].gsub("width: 100%","width: 350px")
    respond_to do |format|
      if @job.update(company_job_params)
        format.html { redirect_to @job, notice: 'Job was successfully updated.' }
        format.json { render :show, status: :ok, location: @job }
      else
        format.html { render :edit }
        format.json { render json: @job.errors, status: :unprocessable_entity }
      end
    end
  end

  def update_images
    @job = Job.find(params[:job_id])
    if @job.present?
      @job.update_attributes(
        files: @job.files.present? ? @job.files.split(',').push(params[:files]).join(',') : params[:files]
      )
    end
    flash[:success] = 'Uploaded Successfully'
    render json: { success: 'File Successfully Updated' }, status: :ok
  end

  def update_media
    # current_company.id.update_attributes(video: params[:video], video_type: params[:video_type])
    @job = Job.find(params[:job_id])
    if @job.present?
      @job.update_attributes(
        comp_video: params[:media],
        media_type: params[:media_type]
      )
    end
    # CompanyVideo.create(:company_id=>current_company.id, :video=>params[:video], :video_type=> params[:video_type] )
    flash.now[:success] = 'File Successfully Updated'
    # redirect_back fallback_location: root_path

    # redirect_to job_path(params[:job_id])
    render json: { success: 'File Successfully Updated' }, status: :ok
    # respond_to do |format|
    #   format.html
    #   format.json { render json: @job }
    # end
  end

  def destroy
    #@job.destroy
    @job.deleted_at  = Time.now
    @job.status       = Job::STATUSES[:cancelled]

    if @job.save
      respond_to do |format|
        format.html { redirect_to jobs_url, notice: 'Job was successfully destroyed.' }
        format.json { head :no_content }
      end
    end
  end

  def send_invitation
    respond_to do |format|
      format.js
    end
  end

  def authorize_user
    has_access?('manage_jobs')
  end

  def share_jobs
    j_ids = params[:jobs_ids].split(',').map(&:to_i)
    jobs = Job.where('id IN (?) AND (DATE(end_date) >= ? OR end_date IS NULL) ', j_ids, Date.today)
    if jobs.present?
      to = []
      bcc = []
      params[:emails].each do |e|
        email = e.include?('[') ? JSON.parse(e) : e
        to << email
      end
      params[:emails_bcc].each do |e|
        email = e.include?('[') ? JSON.parse(e) : e
        bcc << email
      end
      Job.share_jobs(to.flatten.uniq.split(','), bcc.flatten.uniq.split(','), j_ids, current_company, params[:message], params[:subject])
      flash[:success] = 'job shared successfully.'
    else
      flash[:errors] = 'There is no one active job.'
    end

    redirect_back fallback_location: root_path
  end

  def import_job
    add_breadcrumb 'Import Job(s)'
  end

  def upload_job
    xlsx = Roo::Spreadsheet.open(params['file'].to_s, extension: :xlsx)

    (1..xlsx.info.split('Last row:')[1].split("\n")[0].to_i).each do |data|
      next unless data != 1

      company = begin
                    Company.find(xlsx.sheet('Sheet1').row(data)[15])
                rescue StandardError
                  nil
                  end
      user = begin
                 User.find(xlsx.sheet('Sheet1').row(data)[16])
             rescue StandardError
               nil
               end

      @job = company.jobs.new

      @job.title = xlsx.sheet('Sheet1').row(data)[0]
      @job.description = xlsx.sheet('Sheet1').row(data)[11]
      @job.location = xlsx.sheet('Sheet1').row(data)[2]
      @job.start_date = xlsx.sheet('Sheet1').row(data)[6]
      @job.end_date = xlsx.sheet('Sheet1').row(data)[7]
      @job.company_id = xlsx.sheet('Sheet1').row(data)[16].to_i
      @job.created_by_id = xlsx.sheet('Sheet1').row(data)[15].to_i
      @job.is_public = xlsx.sheet('Sheet1').row(data)[14]
      @job.job_category = xlsx.sheet('Sheet1').row(data)[3]
      @job.industry = xlsx.sheet('Sheet1').row(data)[4]
      @job.department = xlsx.sheet('Sheet1').row(data)[5]
      @job.price = xlsx.sheet('Sheet1').row(data)[8]
      @job.job_type = xlsx.sheet('Sheet1').row(data)[9]
      @job.listing_type = xlsx.sheet('Sheet1').row(data)[1]
      @job.comp_video = xlsx.sheet('Sheet1').row(data)[10]

      next unless @job.save
      #   if !xlsx.sheet('Sheet1').row(data)[13].blank?
      #     tags_data = xlsx.sheet('Sheet1').row(data)[13].split(",")
      #     tags_data.each do |tag|
      #       @job.tags.create(:name=>tag)
      #     end
      #   end
    end

    redirect_to company_import_job_path, notice: 'Successfully imported.'
  end

  def upload_candidate
    xlsx = Roo::Spreadsheet.open(params['file'].to_s, extension: :xlsx)

    (1..xlsx.info.split('Last row:')[1].split("\n")[0].to_i).each do |data|
      next unless data != 1

      candidate = Candidate.new

      candidate.email = xlsx.sheet('Sheet1').row(data)[0]
      candidate.phone = xlsx.sheet('Sheet1').row(data)[1]
      candidate.first_name = xlsx.sheet('Sheet1').row(data)[2]
      candidate.last_name = xlsx.sheet('Sheet1').row(data)[3]
      candidate.gender = xlsx.sheet('Sheet1').row(data)[4]
      candidate.password = xlsx.sheet('Sheet1').row(data)[5]
      candidate.password_confirmation = xlsx.sheet('Sheet1').row(data)[6]

      candidate.save
    end
    redirect_to company_import_job_path, notice: 'Successfully imported.'
  end

  def upload_company
    xlsx = Roo::Spreadsheet.open(params['file'].to_s, extension: :xlsx)

    (1..xlsx.info.split('Last row:')[1].split("\n")[0].to_i).each do |data|
      next unless data != 1

      next unless xlsx.sheet('Sheet1').row(data)[6] && !xlsx.sheet('Sheet1').row(data)[6].blank?

      companies = Company.where(domain: xlsx.sheet('Sheet1').row(data)[6])
      if !companies.blank?
        company_contact = CompanyContact.create(company_id: companies.first.id, email: xlsx.sheet('Sheet1').row(data)[14], first_name: xlsx.sheet('Sheet1').row(data)[10], last_name: xlsx.sheet('Sheet1').row(data)[11], phone: xlsx.sheet('Sheet1').row(data)[12], title: xlsx.sheet('Sheet1').row(data)[13]) unless xlsx.sheet('Sheet1').row(data)[14].blank?
        # render json: {message: "Contact created sucessfully", data: {params: companies}}
        # redirect_to company_import_job_path , notice: 'Successfully imported.'

      else
        total_slug = Company.where('slug like ?', "#{xlsx.sheet('Sheet1').row(data)[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}_").count
        @company = Company.new

        @company.name = xlsx.sheet('Sheet1').row(data)[0]
        @company.website = xlsx.sheet('Sheet1').row(data)[1]
        @company.description = xlsx.sheet('Sheet1').row(data)[2]
        @company.phone = xlsx.sheet('Sheet1').row(data)[3]
        @company.company_type = xlsx.sheet('Sheet1').row(data)[4]
        @company.slug = xlsx.sheet('Sheet1').row(data)[5]
        @company.domain = xlsx.sheet('Sheet1').row(data)[6]
        # @company.password = xlsx.sheet('Sheet1').row(data)[7]
        # @company.password_confirmation = xlsx.sheet('Sheet1').row(data)[8]
        @company.email = xlsx.sheet('Sheet1').row(data)[9]

        @company.slug = if total_slug == 0
                          xlsx.sheet('Sheet1').row(data)[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase.to_s
                        else
                          xlsx.sheet('Sheet1').row(data)[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase.to_s + (total_slug + 1).to_s
                        end

        # @company.slug = total_slug == 0 ? "#{params["company"]["domain"].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}" : "#{params["company"]["domain"].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}" + "#{total_slug - 1}"
        if @company.valid? && @company.save
          company_contact = CompanyContact.create(company_id: companies.first.id, email: xlsx.sheet('Sheet1').row(data)[14], first_name: xlsx.sheet('Sheet1').row(data)[10], last_name: xlsx.sheet('Sheet1').row(data)[11], phone: xlsx.sheet('Sheet1').row(data)[12], title: xlsx.sheet('Sheet1').row(data)[13]) unless xlsx.sheet('Sheet1').row(data)[14].blank?
          # render json: {message: "Company created sucessfully", data: {company:  @company}}
          # redirect_to company_import_job_path , notice: 'Successfully imported.'

        else
          # render json: {message: "Somthing went Wrong", data: {company:  @company.errors.full_messages}}
          # redirect_to company_import_job_path , notice: 'Somthing went Wrong.'

        end

      end
    end

    redirect_to company_import_job_path, notice: 'Successfully imported.'
  end

  def upload_contacts
    xlsx = Roo::Spreadsheet.open(params['file'].to_s, extension: :xlsx)

    (1..xlsx.info.split('Last row:')[1].split("\n")[0].to_i).each do |data|
      next unless data != 1

      next unless xlsx.sheet('Sheet1').row(data)[6] && !xlsx.sheet('Sheet1').row(data)[6].blank?

      companies = Company.where(domain: xlsx.sheet('Sheet1').row(data)[6])
      if !companies.blank?
        company_contact = CompanyContact.create(company_id: companies.first.id, email: xlsx.sheet('Sheet1').row(data)[14], first_name: xlsx.sheet('Sheet1').row(data)[10], last_name: xlsx.sheet('Sheet1').row(data)[11], phone: xlsx.sheet('Sheet1').row(data)[12], title: xlsx.sheet('Sheet1').row(data)[13]) unless xlsx.sheet('Sheet1').row(data)[14].blank?
        # render json: {message: "Contact created sucessfully", data: {params: companies}}
        # redirect_to company_import_job_path , notice: 'Successfully imported.'

      else
        total_slug = Company.where('slug like ?', "#{xlsx.sheet('Sheet1').row(data)[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}_").count
        @company = Company.new

        @company.name = xlsx.sheet('Sheet1').row(data)[0]
        @company.website = xlsx.sheet('Sheet1').row(data)[1]
        @company.description = xlsx.sheet('Sheet1').row(data)[2]
        @company.phone = xlsx.sheet('Sheet1').row(data)[3]
        @company.company_type = xlsx.sheet('Sheet1').row(data)[4]
        @company.slug = xlsx.sheet('Sheet1').row(data)[5]
        @company.domain = xlsx.sheet('Sheet1').row(data)[6]
        # @company.password = xlsx.sheet('Sheet1').row(data)[7]
        # @company.password_confirmation = xlsx.sheet('Sheet1').row(data)[8]
        @company.email = xlsx.sheet('Sheet1').row(data)[9]

        @company.slug = if total_slug == 0
                          xlsx.sheet('Sheet1').row(data)[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase.to_s
                        else
                          xlsx.sheet('Sheet1').row(data)[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase.to_s + (total_slug + 1).to_s
                        end

        # @company.slug = total_slug == 0 ? "#{params["company"]["domain"].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}" : "#{params["company"]["domain"].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}" + "#{total_slug - 1}"
        if @company.valid? && @company.save
          company_contact = CompanyContact.create(company_id: companies.first.id, email: xlsx.sheet('Sheet1').row(data)[14], first_name: xlsx.sheet('Sheet1').row(data)[10], last_name: xlsx.sheet('Sheet1').row(data)[11], phone: xlsx.sheet('Sheet1').row(data)[12], title: xlsx.sheet('Sheet1').row(data)[13]) unless xlsx.sheet('Sheet1').row(data)[14].blank?
          # render json: {message: "Company created sucessfully", data: {company:  @company}}
          # redirect_to company_import_job_path , notice: 'Successfully imported.'

        else
          # render json: {message: "Somthing went Wrong", data: {company:  @company.errors.full_messages}}
          # redirect_to company_import_job_path , notice: 'Somthing went Wrong.'

        end

      end
    end

    redirect_to company_import_job_path, notice: 'Successfully imported.'
  end

  def download_job_template
    send_file Rails.root.join('app', 'assets', 'images', 'Job_example_template.xlsx').to_s,
              type: 'text/html'
  end

  def download_product_template
    send_file Rails.root.join('app', 'assets', 'images', 'product_example_template.xlsx').to_s,
              type: 'text/html'
  end

  def download_service_template
    send_file Rails.root.join('app', 'assets', 'images', 'service_example_template.xlsx').to_s,
              type: 'text/html'
  end

  def download_training_template
    send_file Rails.root.join('app', 'assets', 'images', 'training_example_template.xlsx').to_s,
              type: 'text/html'
  end

  def download_candidate_template
    send_file Rails.root.join('app', 'assets', 'images', 'candidate_example_template.xlsx').to_s,
              type: 'text/html'
  end

  def download_company_template
    send_file Rails.root.join('app', 'assets', 'images', 'company_example_template.xlsx').to_s,
              type: 'text/html'
  end

  def download_contacts_template
    send_file Rails.root.join('app', 'assets', 'images', 'contacts_example_template.xlsx').to_s,
              type: 'text/html'
  end

  private

  def set_candidates
    @candidates = current_company.candidates
  end

  def set_company_job
    @job = current_company.jobs.find_by_id(params[:id]) || []
  end

  # def set_locations
  #   @locations = current_company.locations || []
  # end

  def set_preferred_vendors_and_groups
    # @preferred_vendors_companies = Company.joins(:users).where("users.type = ?" , 'Vendor') - [current_company]|| []
    @preferred_vendors_companies = Company.vendors - [current_company, Company.get_freelancer_company] || []
    @preferred_groups = current_company.groups.contact_groups
  end

  def company_job_params
    params.require(:job).permit([:status, :source, :title, :files, :description, :location, :job_category, :is_public, :start_date, :end_date, :tag_list, :video_file, :industry, :department, :job_type, :price, :education_list, :comp_video, :listing_type, :allow_multiple_applications_for_candidate, custom_fields_attributes:
        %i[
          id
          name
          value
          required
          _destroy
        ], job_requirements_attributes: %i[
          id
          questions
          ans_type
          ans_mandatroy
          multiple_ans
          multiple_option
          _destroy
        ]])
  end
end
