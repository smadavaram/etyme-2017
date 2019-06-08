var ready = function () {

  /**
   * When the send message link on our home page is clicked
   * send an ajax request to our rails app with the sender_id and
   * recipient_id
   */

  $("#self-conversation-search").on("keyup", function () {
    if (/\S/.test($("#self-conversation-search").val())){
      $(".user-w").hide();
    } else {
      $(".user-w").show();
    }
    $("#self-conversations[username*='" + $(this).val() + "']").show()
  });


  // $('.start-conversation').click(function (e) {
  $(document).on('click', '.start-conversation', function (e) {
    e.preventDefault();
    //var sender_id = $(this).data('sid');
    //var recipient_id = $(this).data('stype');
    var recipient_id = $(this).data('rid');
    var recipient_type = $(this).data('rtype');
    var chatable_id = $(this).data('cid');
    var chatable_type = $(this).data('ctype');
    var chat_topic = $(this).data('chattopic');

    $.post("/conversations", {
      user_type: recipient_type,
      user_id: recipient_id,
      chat_topic: chat_topic,
      chatable_id: chatable_id,
      chatable_type: chatable_type
    }, function (data) {
      //$("#unread-message-notify-"+data.user_id).html(data.unread_message_count)
      chatBox.chatWith(data.conversation_id);

    });
  });

  $(document).on('click', '.add-to-conversation', function (e) {
    e.preventDefault();
    var chatable_id = $(this).data('cid');
    var chatable_type = $(this).data('ctype');
    var con_id = $(this).data('conid');

    $("#chatcid").val(chatable_id);
    $("#chatctype").val(chatable_type);
    $("#chatconversation").val(con_id);

    $("#addToChatModal").modal("show")

    // $.post("/conversations", { user_type: recipient_type, user_id: recipient_id, chat_topic: chat_topic, chatable_id: chatable_id, chatable_type: chatable_type }, function (data) {
    //     //$("#unread-message-notify-"+data.user_id).html(data.unread_message_count)
    //     chatBox.chatWith(data.conversation_id);
    // });
  });

  /**
   * Used to minimize the chatbox
   */

  $(document).on('click', '.toggleChatBox', function (e) {
    e.preventDefault();

    var id = $(this).data('cid');
    chatBox.toggleChatBoxGrowth(id);
  });

  /**
   * Used to close the chatbox
   */

  $(document).on('click', '.closeChat', function (e) {
    e.preventDefault();

    var id = $(this).data('cid');
    chatBox.close(id);
  });


  /**
   * Listen on keypress' in our chat textarea and call the
   * chatInputKey in chat.js for inspection
   */

  $(document).on('keydown', '.chatboxtextarea', function (event) {
    var id = $(this).data('cid');
    chatBox.checkInputKey(event, $(this), id);
  });

  /**
   * When a conversation link is clicked show up the respective
   * conversation chatbox
   */

  $('a.conversation').click(function (e) {
    e.preventDefault();
    alert("00000");
    var conversation_id = $(this).data('cid');
    chatBox.chatWith(conversation_id);
  });

  /**
   * Handle chat message send event
   * */

  // $(document).on('click', '#send-chat-message', function (event) {
  //    $('.chatboxtextarea').val('');
  //    $('.chatboxtextarea').focus();
  //    $('.chatboxtextarea').css('height', '44px');
  // });

}

$(document).ready(ready);
$(document).on("page:load", ready);