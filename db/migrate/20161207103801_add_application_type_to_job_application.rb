class AddApplicationTypeToJobApplication < ActiveRecord::Migration[4.2]
  def change
    add_column :job_applications, :application_type, :integer
  end
end
