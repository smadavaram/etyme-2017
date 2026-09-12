# frozen_string_literal: true

class Candidate::ClientsController < Candidate::BaseController
  before_action :set_client, only: :update

  def update
    if @client.update(client_params)
      flash[:success] = 'Successfully updated Client Info'
    else
      flash[:errors] = @client.errors.full_messages
    end
    redirect_back(fallback_location: my_profile_path)
  end

  private

  def client_params
    params.require('client').permit(:name, :industry, :start_date, :end_date, :project_description, :role, :refrence_name, :refrence_phone, :refrence_email, :refrence_two_name, :refrence_two_phone, :refrence_two_email)
  end

  def set_client
    @client = current_candidate.clients.find_by(id: params[:id])
  end
end
