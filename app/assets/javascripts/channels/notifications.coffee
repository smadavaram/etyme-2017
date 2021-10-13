App.notifications = App.cable.subscriptions.create "NotificationsChannel",
  connected: ->
    debugger
    # Called when the subscription is ready for use on the server

  disconnected: ->
    # Called when the subscription has been terminated by the server

  received: (data) ->
     if $(".messages-notifications").parent().find(".new-messages-count").hasClass("new-messages-count")==true 
       count = parseInt($(".new-messages-count").text())
       $(".new-messages-count").text(count+1)
     else
       count = 1;
       $(".div-style-2").append('<div class="new-messages-count">'+count+'</div>')
    # Called when there's incoming data on the websocket for this channel
