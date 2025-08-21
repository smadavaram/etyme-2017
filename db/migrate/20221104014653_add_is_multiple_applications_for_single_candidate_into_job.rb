class AddIsMultipleApplicationsForSingleCandidateIntoJob < ActiveRecord::Migration[5.2]
  def change
    add_column :jobs, :allow_multiple_applications_for_candidate, :boolean, default: false
  end
end
