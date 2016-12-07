class AddApplicationTypeToJobApplication < ActiveRecord::Migration
  def change
    add_column :job_applications, :application_type, :integer
  end
end
