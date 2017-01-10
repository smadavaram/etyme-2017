class RenameTheLoationFieldInJobsModel < ActiveRecord::Migration
  def change
    rename_column :jobs ,:location_id ,:location
    change_column :jobs ,:location ,:string
  end
end
