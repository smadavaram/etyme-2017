class Candidate::CandidatesController < Candidate::BaseController
  before_filter :authenticate_user!
  respond_to :html,:json

  before_action :set_candidate ,only: [:show,:update]

  add_breadcrumb 'Candidates', "#", :title => ""

  def dashboard
  end

  def show
    add_breadcrumb current_candidate.full_name.titleize, profile_path(current_candidate), :title => ""
  end

  def update
    if current_candidate.update_attributes candidate_params
      flash[:success]="Candidate Updated"
      respond_with current_candidate
    else
      redirect_to :back
      # format.js(current_candidate,notice:"Incorrect Information")
    end
  end

  def notify_notifications
    @notifications = current_candidate.notifications || []
  end


  private

    def set_candidate
      @candidate=Candidate.find_by_id(params[:id])
    end

    def candidate_params
      params.require(:candidate).permit(:first_name,:invited_by ,:job_id, :last_name,:dob,:email,:phone,:skills, :primary_address_id,:tag_list,address_attributes: [:id,:country,:city,:state,:zip_code])
    end


end
