# frozen_string_literal: true

class Candidate::ExperiencesController < Candidate::BaseController
  before_action :find_experience, only: [:update]
  respond_to :json, :js
  def create
    @experience = current_candidate.experiences.new(experience_params)
    if @experience.save
      flash[:success] = 'Experience successfully created.'
    else
      flash[:errors] = @experience.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def update
    if @experience.update_attributes(experience_params)
      flash[:success] = 'experience Changed.'
    else
      flash[:errors] = @experience.errors.full_messages
    end
    respond_with @experience
  end

  private

  def find_experience
    @experience = current_candidate.experiences.find(params[:id])
  end

  def experience_params
    params.require(:experience).permit(:id, :experience_title, :end_date, :start_date, :institute, :description)
  end
end
