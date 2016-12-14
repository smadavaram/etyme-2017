class Candidate::CandidatesController < Candidate::BaseController


  respond_to :html,:json

  #Callbacks
  before_action :set_candidate ,only: [:show,:update]

  add_breadcrumb 'Companies', "#", :title => ""

  def dashboard
  end
  def show
    add_breadcrumb current_candidate.full_name.titleize, profile_path, :title => ""
    current_candidate.build_address
  end

  def update
    if current_candidate.update_attributes candidate_params
      flash[:success]="Candidate Updated"
      respond_with current_candidate
    else
      # format.js(current_candidate,notice:"Incorrect Information")
    end

  end


  private

    def set_candidate
      @candidate=Candidate.find_by_id(params[:id])
    end

    def candidate_params
      params.require(:candidate).permit(:first_name,:last_name,:dob,:email,:phone,:skills, :tag_list,address_attributes: [:country,:city,:state,:zip_code])
    end


end
