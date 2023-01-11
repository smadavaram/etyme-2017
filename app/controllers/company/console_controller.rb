# frozen_string_literal: true

class Company::ConsoleController < Company::BaseController
  # before_action :authorize_user, only: %i[show edit update destroy]
  before_action :find_job, only: %i[job]
  
  add_breadcrumb 'Dashboard', :dashboard_path

  def candidates
    add_breadcrumb 'Console'

    @candidates = current_company.hot_candidates.order(created_at: :desc).uniq(&:candidate_id).paginate(page: params[:page], per_page: 10) || []
  end

  def jobs
    add_breadcrumb 'Console'

    @jobs = current_company.jobs.where(listing_type: 'Job', status: 'Published').order(created_at: :desc).paginate(page: params[:page], per_page: 10) || []
  end

  def job
    if request.post?
      application, application_type = apply_candidate_for_job()
      ((render json: {}, status: :ok); return) if application_type==:console_bench

      respond_to do |format|
        format.html {redirect_back(fallback_location: root_path)}
        format.js {(render :js => "window.open('#{job_application_path(application)}', '_blank').focus();")}
      end
    else
      @search = @job.matches.includes(:skills).ransack(first_name_or_last_name_or_skills_or_candidate_title_cont: params[:q])
      @candidates = @search.result.uniq.first(20)
      @search_key = params[:q]

      respond_to do |format|
        format.js
        format.html { redirect_to company_console_jobs_path }
      end
    end
  end

  def candidate
    @candidate = Candidate.find(params[:id])
    @search = @candidate.matches.includes(:tags).ransack(title_or_description_cont: params[:q])
    @jobs = @search.result.uniq.first(20)
    @search_key = params[:q]

    respond_to do |format|
      format.js
      format.html { redirect_to company_console_candidates_path }
    end
  end

  def apply_candidate_for_job
    messages = []
    application = nil
    application_type = nil

    Candidate.where(id: params[:temp_candidates]).each do |c|
      begin
        my_job = current_company.jobs.find_by(id: @job.id)
        my_candidate = current_company.hot_candidates.find_by(candidate_id: c.id)

        if my_candidate and my_job
          application_type = :console_internal
        elsif my_candidate
          application_type = :console_bench
        else
          application_type = :console_job
        end

        unless @job.status == 'Bench'
          application = c.job_applications.create!(applicant_resume: c.resume,
                                                  job_id: @job.id,
                                                  applied_by: current_user,
                                                  application_type: application_type)
          current_company.sent_job_applications << application if application_type == :console_bench
        end
      rescue ActiveRecord::RecordInvalid => e
        messages << "#{c.first_name} is already an applicant"
      end
    end
    return application, application_type
  end

  def find_job
    @job = Job.find(params[:id])
  end
end
