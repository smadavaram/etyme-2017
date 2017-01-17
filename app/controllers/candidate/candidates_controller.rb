class Candidate::CandidatesController < Candidate::BaseController

  respond_to :html,:json,:js

  before_action :set_candidate ,only: [:show,:update]

  add_breadcrumb 'Candidates', "#", :title => ""

  def dashboard
  end

  def show
    add_breadcrumb current_candidate.full_name.titleize, profile_path, :title => ""
  end

  def update
    respond_to do  |format|
    if current_candidate.update_attributes candidate_params

      format.json {respond_with current_candidate}
      format.html {
        flash[:success] = "Candidate Updated"
        redirect_to :back
      }

    else
      format.html{redirect_to :back}
      format.json{redirect_to :back }
    end
    end
  end

  def upload_resume
    if current_candidate.update(resume: params[:resume])
      flash[:success] = "Resume uploaded successfully."
    else
      flash[:errors] = 'Resume not updated'
    end
    redirect_to :back
  end

  def update_photo
    render json: current_candidate.update_attribute(:photo, params[:photo])
    flash.now[:success] = "Photo Successfully Updated"
  end

  def notify_notifications
    @notifications = current_candidate.notifications || []
    render layout: false
  end


  private

    def set_candidate
      @candidate=Candidate.find_by_id(params[:id])
    end

    def candidate_params
      params.require(:candidate).permit(:first_name,:invited_by ,:job_id,:description, :last_name,:dob,:email,:phone, :skill_list, :primary_address_id,address_attributes: [:id,:country,:city,:state,:zip_code])
    end


end
